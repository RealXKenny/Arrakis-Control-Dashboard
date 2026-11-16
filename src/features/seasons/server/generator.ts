import '../../../lib/assert-server';
import { randomUUID, createHash } from 'node:crypto';
import { z } from 'zod';
import content from '../content/season-2-template.json';
import { definitionSchema, seasonState, type Season } from '../contracts';
import { AppError } from '../../../lib/errors';
import {
  currentWindow,
  seasonWindow,
  generateSeason,
  generatorSettingsSchema,
  validateGeneratorTemplate,
  automaticProgressTemplate,
  type GeneratorSettings,
} from '../generation';
import { commit, fail, loadSeason, readRecord, seasonKeys, listSeasons, storage } from './store';
import { transitionSeason } from './engine';
import { loadItemCatalog } from './item-catalog';
import { createLogger } from '../../../lib/logger';

const policySchema = z
  .object({
    algorithm: z.union([z.literal(1), z.literal(2)]),
    revision: z.string().uuid(),
    series: z.string().uuid(),
    enabled: z.boolean(),
    settings: generatorSettingsSchema,
    template: definitionSchema,
    nextNumber: z.number().int().min(1).max(100000),
    nextWindow: z.number().int().min(0).max(10000),
    pending: z
      .object({
        id: z.string().uuid(),
        number: z.number().int(),
        index: z.number().int(),
        hash: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .nullable(),
    lastPublished: z.string().nullable(),
    error: z.string().max(300).nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
type Policy = z.infer<typeof policySchema>;
const actor = 'system:season-generator';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function policyRecord() {
  const record = await readRecord<Policy>(seasonKeys.generator);
  return { ...record, value: record.value ? policySchema.parse(record.value) : null };
}
function view(policy: Policy | null) {
  return policy
    ? {
        revision: policy.revision,
        enabled: policy.enabled,
        algorithm: policy.algorithm,
        settings: policy.settings,
        nextNumber: policy.nextNumber,
        nextWindow: policy.nextWindow,
        pendingId: policy.pending?.id ?? null,
        lastPublished: policy.lastPublished,
        error: policy.error,
        updatedAt: policy.updatedAt,
      }
    : {
        revision: '',
        enabled: false,
        algorithm: 2 as const,
        settings: null,
        nextNumber: null,
        nextWindow: null,
        pendingId: null,
        lastPublished: null,
        error: null,
        updatedAt: null,
      };
}
export type GeneratorView = ReturnType<typeof view>;
export async function generatorStatus() {
  return view((await policyRecord()).value);
}
export async function configureGenerator(
  revision: string,
  settings: GeneratorSettings,
  admin: string,
  templateSeasonId?: string,
) {
  settings = generatorSettingsSchema.parse(settings);
  const record = await policyRecord();
  if ((record.value?.revision ?? '') !== revision) fail('Generator settings changed. Reload first.');
  if (record.value?.enabled) fail('Pause automatic seasons before changing their configuration.');
  const defaults = automaticProgressTemplate(definitionSchema.parse(content.definition));
  const source = templateSeasonId ? (await loadSeason(templateSeasonId)).value.definition : defaults;
  let template: ReturnType<typeof validateGeneratorTemplate>;
  try {
    template = validateGeneratorTemplate(source);
  } catch {
    fail(
      'Choose a 100-level template with 100 rewards and 20 API-observed objectives per path. Reviewed evidence cannot be automated.',
      400,
    );
  }
  const policy: Policy = {
    algorithm: 2,
    revision: randomUUID(),
    series: randomUUID(),
    enabled: true,
    settings,
    template,
    nextNumber: settings.firstNumber,
    nextWindow: 0,
    pending: null,
    lastPublished: null,
    error: null,
    updatedAt: new Date().toISOString(),
  };
  await commit({
    id: 'automation',
    actor: admin,
    action: 'generator.enabled',
    writes: [{ key: seasonKeys.generator, before: record.raw, after: policy }],
    detail: {
      firstNumber: settings.firstNumber,
      firstStart: settings.firstStart,
      timezone: settings.timezone,
      template: templateSeasonId ?? 'default-new-game-progress',
      algorithm: 2,
    },
  });
  return view(policy);
}
export async function setGeneratorEnabled(revision: string, enabled: boolean, admin: string) {
  const record = await policyRecord();
  if (!record.value || record.value.revision !== revision) fail('Generator settings changed. Reload first.');
  const next = {
    ...record.value,
    enabled,
    error: enabled ? null : record.value.error,
    revision: randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await commit({
    id: 'automation',
    actor: admin,
    action: enabled ? 'generator.resumed' : 'generator.paused',
    writes: [{ key: seasonKeys.generator, before: record.raw, after: next }],
  });
  return view(next);
}

/** Each restart or instance reconciles the durable cursor. A policy CAS fences publication against pause/reconfigure. */
async function step() {
  const record = await policyRecord(),
    policy = record.value;
  if (!policy?.enabled) return false;
  if (policy.algorithm === 1) {
    const next: Policy = {
      ...policy,
      algorithm: 2,
      revision: randomUUID(),
      updatedAt: new Date().toISOString(),
      template: policy.template.challenges.every((c) => c.verification === 'character-level')
        ? automaticProgressTemplate(policy.template)
        : policy.template,
    };
    await commit({
      id: 'automation',
      actor,
      action: 'generator.upgraded',
      writes: [{ key: seasonKeys.generator, before: record.raw, after: next }],
      detail: { algorithm: 2 },
    });
    return true;
  }
  if (policy.pending) {
    const seasonRecord = await loadSeason(policy.pending.id),
      season = seasonRecord.value;
    if (hash(season.definition) !== policy.pending.hash)
      fail('Generated rules were edited. Pause and review the configuration before continuing.');
    if (season.phase === 'draft') {
      await transitionSeason(season.id, season.revision, 'publish', actor, {
        key: seasonKeys.generator,
        before: record.raw,
      });
      return true;
    }
    if (seasonState(season) === 'scheduled') return false;
    if (!['published', 'ended', 'archived'].includes(season.phase))
      fail('Generated season requires administrator review.');
    if (policy.lastPublished && policy.lastPublished !== season.id) {
      const previous = (await loadSeason(policy.lastPublished)).value;
      if (seasonState(previous) === 'ended') {
        await transitionSeason(previous.id, previous.revision, 'archive', actor, {
          key: seasonKeys.generator,
          before: record.raw,
        });
        return true;
      }
    }
    if (policy.pending.index >= 10000) fail('Automatic season window safety bound reached.');
    const next: Policy = {
      ...policy,
      revision: randomUUID(),
      pending: null,
      lastPublished: season.id,
      nextNumber: policy.pending.number + 1,
      nextWindow: policy.pending.index + 1,
      updatedAt: new Date().toISOString(),
    };
    await commit({
      id: 'automation',
      actor,
      action: 'generator.advanced',
      writes: [
        { key: seasonKeys.generator, before: record.raw, after: next },
        { key: seasonKeys.season(season.id), before: seasonRecord.raw },
      ],
    });
    return true;
  }
  if (policy.nextNumber > 99999) fail('Automatic season numbering reached its configured safety bound.');
  const index = Math.max(policy.nextWindow, currentWindow(policy.settings.firstStart, Date.now()));
  const catalog = await loadItemCatalog();
  // A temporarily unreachable Console must not downgrade a season that starts days from now; wait and retry instead.
  if (catalog === null && Date.parse(seasonWindow(policy.settings.firstStart, index).startsAt) - Date.now() > 86400000)
    return false;
  const definition = generateSeason(policy.template, policy.settings, policy.nextNumber, index, catalog);
  // UUID derives from the series and cursor; parallel/restarted schedulers converge on the same record.
  const hex = hash(`${policy.series}:${policy.nextNumber}`);
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  const existing = await readRecord<Season>(seasonKeys.season(id));
  if (existing.raw) fail('Generated season identity already exists. Review automation before resuming.');
  const now = new Date().toISOString();
  const season: Season = {
    id,
    revision: randomUUID(),
    phase: 'draft',
    definition,
    createdAt: now,
    version: 1,
    automatic: true,
  };
  const next: Policy = {
    ...policy,
    revision: randomUUID(),
    pending: { id, number: policy.nextNumber, index, hash: hash(definition) },
    updatedAt: now,
  };
  await commit({
    id,
    actor,
    action: 'season.generated',
    writes: [
      { key: seasonKeys.generator, before: record.raw, after: next },
      { key: seasonKeys.season(id), before: '', after: season },
    ],
    index: { id, score: Date.parse(now) },
    detail: { number: policy.nextNumber, algorithm: 2, skippedWindows: index - policy.nextWindow },
  });
  return true;
}
export async function runGenerator() {
  for (let i = 0; i < 6; i++) {
    const before = await policyRecord();
    if (!before.value?.enabled) break;
    try {
      if (!(await step())) break;
    } catch (error) {
      const current = await policyRecord();
      // A concurrent scheduler/admin won the CAS: leave its state alone and reconcile on the next tick.
      if (current.raw !== before.raw) break;
      if (error instanceof AppError && /changed\.|lifecycle transition is unavailable/.test(error.message)) break;
      const reason =
        error instanceof AppError && error.expose
          ? error.message
          : 'Automatic season preparation failed. Check configuration, schedule overlaps and Redis availability.';
      const next: Policy = {
        ...current.value!,
        enabled: false,
        error: reason.slice(0, 300),
        revision: randomUUID(),
        updatedAt: new Date().toISOString(),
      };
      await commit({
        id: 'automation',
        actor,
        action: 'generator.blocked',
        writes: [{ key: seasonKeys.generator, before: current.raw, after: next }],
      });
      break;
    }
  }
  return generatorStatus();
}
/** Only an absent policy is initialized. Explicit pause/opt-out and published seasons are preserved. */
export async function ensureDefaultGenerator() {
  const record = await policyRecord();
  if (record.value) return;
  const recent = await listSeasons(0, true);
  const ids = await storage().command(['ZRANGEBYSCORE', seasonKeys.schedules, Date.now(), '+inf', 'LIMIT', 0, 101]);
  if (!Array.isArray(ids) || ids.length > 100) fail('Review existing schedules before automatic setup.');
  const future = await Promise.all(ids.map((id) => loadSeason(String(id))));
  const seasons = [...recent, ...future.map((r) => r.value)];
  const firstNumber = Math.max(0, ...seasons.map((s) => s.definition.number)) + 1;
  const firstStart = new Date(
    Math.max(Date.now(), ...seasons.filter((s) => s.phase === 'published').map((s) => Date.parse(s.definition.endsAt))),
  ).toISOString();
  try {
    await configureGenerator('', { firstNumber, firstStart, timezone: 'UTC' }, actor);
  } catch (error) {
    if (!(await policyRecord()).value) throw error;
  }
}
export function startSeasonGenerator() {
  let running = false;
  const log = createLogger('SEASONS');
  const scan = async () => {
    if (running) return;
    running = true;
    try {
      await ensureDefaultGenerator();
      await runGenerator();
    } catch {
      log.warn('Automatic seasons are temporarily unavailable.');
    } finally {
      running = false;
    }
  };
  void scan();
  const timer = setInterval(() => void scan(), 60000);
  timer.unref();
}
