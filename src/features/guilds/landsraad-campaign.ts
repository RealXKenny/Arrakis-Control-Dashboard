import { z } from 'zod';

export const CAMPAIGN_TARGET_LIMIT = 30;
export const CAMPAIGN_ASSIGNEE_LIMIT = 10;
export const campaignPriorities = ['high', 'normal', 'low'] as const;
export const campaignStatuses = ['planned', 'active', 'met', 'dropped'] as const;
export const campaignStatusLabel = { planned: 'Planned', active: 'In progress', met: 'Target met', dropped: 'Dropped' };
export const campaignPriorityLabel = { high: 'High priority', normal: 'Normal priority', low: 'Low priority' };

const memberId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const ref = z.string().regex(/^[a-f0-9]{24}$/);
const taskKey = z.string().regex(/^[a-zA-Z0-9_.:-]{1,80}$/);
const targetDraft = {
  id: z.uuid(),
  taskKey: taskKey.nullable(),
  title: z.string().trim().min(1).max(100),
  goal: z.string().trim().max(500),
  priority: z.enum(campaignPriorities),
  status: z.enum(campaignStatuses),
};
const targetFields = {
  ...targetDraft,
  termId: z.string().min(1).max(120).nullable(),
  updatedAt: z.iso.datetime(),
  updatedBy: z.string().min(1).max(200),
};
export const campaignTargetSchema = z.object({
  ...targetFields,
  assignees: z
    .array(z.object({ memberId, name: z.string().min(1).max(200) }))
    .max(CAMPAIGN_ASSIGNEE_LIMIT)
    .refine((values) => new Set(values.map((entry) => entry.memberId)).size === values.length),
});
export const campaignDocumentSchema = z
  .object({
    revision: z.uuid(),
    targets: z
      .array(campaignTargetSchema)
      .max(CAMPAIGN_TARGET_LIMIT)
      .refine((values) => new Set(values.map((entry) => entry.id)).size === values.length),
  })
  .strict();
export const landsraadTaskSchema = z.object({
  key: taskKey,
  label: z.string().min(1).max(160),
  completed: z.boolean().nullable(),
  winner: z.enum(['atreides', 'harkonnen']).nullable(),
});
export const landsraadObservationSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    termId: z.string().min(1).max(120),
    endsAt: z.iso.datetime().nullable(),
    tasks: z.array(landsraadTaskSchema).max(200),
    unidentified: z.number().int().min(0),
    observedAt: z.iso.datetime(),
  }),
  z.object({ status: z.literal('unsupported') }),
  z.object({ status: z.literal('unavailable') }),
]);
export const campaignViewSchema = z.object({
  revision: z.uuid().nullable(),
  canEdit: z.boolean(),
  observation: landsraadObservationSchema,
  targets: z
    .array(
      z.object({
        ...targetFields,
        assignees: z.array(z.object({ ref, name: z.string(), isSelf: z.boolean() })).max(CAMPAIGN_ASSIGNEE_LIMIT),
      }),
    )
    .max(CAMPAIGN_TARGET_LIMIT),
  members: z.array(z.object({ ref, name: z.string(), isSelf: z.boolean() })).max(500),
});
export const campaignInputSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('save'),
      revision: z.uuid().nullable(),
      target: z.object({ ...targetDraft, assigneeRefs: z.array(ref).max(CAMPAIGN_ASSIGNEE_LIMIT) }).strict(),
    })
    .strict(),
  z.object({ action: z.literal('delete'), revision: z.uuid(), id: z.uuid() }).strict(),
  z.object({ action: z.literal('claim'), revision: z.uuid(), id: z.uuid() }).strict(),
  z.object({ action: z.literal('unclaim'), revision: z.uuid(), id: z.uuid() }).strict(),
]);
export type CampaignDocument = z.infer<typeof campaignDocumentSchema>;
export type CampaignInput = z.infer<typeof campaignInputSchema>;
export type CampaignView = z.infer<typeof campaignViewSchema>;
export type LandsraadObservation = z.infer<typeof landsraadObservationSchema>;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function identifier(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,80}$/.test(value.trim()) ? value.trim() : null;
}
function words(...values: unknown[]): string | null {
  for (const value of values)
    if (typeof value === 'string' && value.trim()) return value.trim().replace(/\s+/g, ' ').slice(0, 160);
  return null;
}

/**
 * Only fields the Console actually reports are used: a task needs a stable ID to be linked, and its
 * completion or winning faction are shown only when present. Progress counts are never estimated.
 */
export function landsraadObservation(raw: unknown, now: number): LandsraadObservation {
  const council = record(raw);
  if (record(council.capabilities).landsraad === false) return { status: 'unsupported' };
  const term = record(council.term);
  const termId = identifier(term.term_id) ?? words(term.term_id);
  if (!termId || !Array.isArray(council.tasks)) return { status: 'unavailable' };
  const tasks: z.infer<typeof landsraadTaskSchema>[] = [];
  let unidentified = 0;
  for (const value of council.tasks.slice(0, 200)) {
    const task = record(value);
    if (task.sysselraad === true) continue;
    const key = identifier(task.task_id ?? task.taskId ?? task.id);
    if (!key || tasks.some((entry) => entry.key === key)) {
      unidentified += 1;
      continue;
    }
    const faction = String(task.winning_faction ?? '').toLowerCase();
    tasks.push({
      key,
      label:
        words(task.name, task.title, task.task_name, task.taskName, task.display_name, task.description) ??
        `Task ${key}`,
      completed: typeof task.completed === 'boolean' ? task.completed : null,
      winner: faction === 'atreides' || faction === 'harkonnen' ? faction : null,
    });
  }
  const endsAt =
    typeof term.end_time === 'string' && Number.isFinite(Date.parse(term.end_time))
      ? new Date(term.end_time).toISOString()
      : null;
  return { status: 'ok', termId, endsAt, tasks, unidentified, observedAt: new Date(now).toISOString() };
}
