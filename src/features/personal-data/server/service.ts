import '../../../lib/assert-server';
import { readPersonalTasks, erasePersonalTasks } from '../../tasks/server/store';
import { readPrivacy, erasePrivacy } from '../../privacy/server/store';
import { emptyPrivacy, type PrivacyRecord } from '../../privacy/model';
import type { TaskRecord } from '../../tasks/model';
import { AppError } from '../../../lib/errors';
import { dataExportSchema, dataSummarySchema, type DataScope, type ScopeSummary } from '../model';
function tasksSummary(record: TaskRecord): ScopeSummary {
  return { scope: 'tasks', revision: record.revision, entries: record.tasks.length, snapshots: 0 };
}
function sharingSummary(record: PrivacyRecord): ScopeSummary {
  const empty = emptyPrivacy();
  return {
    scope: 'sharing',
    revision: record.revision,
    entries: Object.keys(empty.drafts).filter(
      (key) =>
        JSON.stringify(record.drafts[key as keyof typeof empty.drafts]) !==
        JSON.stringify(empty.drafts[key as keyof typeof empty.drafts]),
    ).length,
    snapshots: Object.values(record.publications).filter(Boolean).length,
  };
}
export async function summarizePersonalData(owner: string) {
  const [tasks, sharing] = await Promise.all([readPersonalTasks(owner), readPrivacy(owner)]);
  return dataSummarySchema.parse({
    checkedAt: new Date().toISOString(),
    scopes: [tasksSummary(tasks), sharingSummary(sharing)],
  });
}
export async function exportPersonalData(owner: string, selections: { scope: DataScope; revision: string | null }[]) {
  const records = await Promise.all(
    selections.map(async ({ scope, revision }) => {
      const current = scope === 'tasks' ? await readPersonalTasks(owner) : await readPrivacy(owner);
      if (current.revision !== revision)
        throw new AppError(
          'Personal data changed. Reload the summary before exporting.',
          409,
          'PERSONAL_DATA_CONFLICT',
          true,
        );
      if (scope === 'tasks') {
        const record = current as TaskRecord;
        return { scope, data: { schemaVersion: record.schemaVersion, revision: record.revision, tasks: record.tasks } };
      }
      const record = current as PrivacyRecord;
      return {
        scope,
        data: {
          schemaVersion: record.schemaVersion,
          revision: record.revision,
          drafts: record.drafts,
          publications: record.publications,
        },
      };
    }),
  );
  const exported = dataExportSchema.parse({
    format: 'arrakis-personal-data',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    records,
  });
  const text = JSON.stringify(exported);
  if (Buffer.byteLength(text) > 524288)
    throw new AppError('Export exceeds the supported download bound.', 413, 'EXPORT_TOO_LARGE', true);
  return exported;
}
export async function erasePersonalData(owner: string, scope: DataScope, revision: string | null) {
  return scope === 'tasks'
    ? tasksSummary(await erasePersonalTasks(owner, revision))
    : sharingSummary(await erasePrivacy(owner, revision));
}
