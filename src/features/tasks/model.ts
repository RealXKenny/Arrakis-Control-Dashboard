import { z } from 'zod';
const label = z.string().trim().min(1).max(160);
const ref = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const taskTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z.object({ type: z.literal('item'), ref: z.string().trim().min(1).max(128), label }).strict(),
  z.object({ type: z.literal('vehicle'), ref, label, view: z.enum(['owned', 'shared']) }).strict(),
  z.object({ type: z.literal('base'), ref, label, view: z.enum(['owned', 'shared']) }).strict(),
  z.object({ type: z.literal('project'), ref: z.uuid() }).strict(),
  z.object({ type: z.literal('goal'), ref: z.uuid() }).strict(),
]);
export type TaskTarget = z.infer<typeof taskTargetSchema>;
export const taskDraftSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['task', 'project', 'goal']),
    title: z.string().trim().min(1).max(120),
    notes: z.string().trim().max(1500),
    priority: z.enum(['normal', 'high']),
    dueDate: z.iso.date().nullable(),
    target: taskTargetSchema,
  })
  .strict()
  .refine(
    (task) => task.kind === 'task' || !['project', 'goal'].includes(task.target.type),
    'Only tasks can link to planning entries.',
  );
export type TaskDraft = z.infer<typeof taskDraftSchema>;
export const storedTaskSchema = taskDraftSchema
  .safeExtend({
    status: z.enum(['open', 'completed']),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .refine((task) => (task.status === 'completed') === (task.completedAt !== null));
export type PersonalTask = z.infer<typeof storedTaskSchema>;
export const taskRecordSchema = z
  .object({ schemaVersion: z.literal(1), revision: z.uuid().nullable(), tasks: z.array(storedTaskSchema).max(100) })
  .strict()
  .refine((record) => new Set(record.tasks.map((t) => t.id)).size === record.tasks.length)
  .refine((record) =>
    record.tasks.every(
      (t) =>
        !['project', 'goal'].includes(t.target.type) ||
        record.tasks.some(
          (parent) => parent.id === ('ref' in t.target ? t.target.ref : '') && parent.kind === t.target.type,
        ),
    ),
  );
export type TaskRecord = z.infer<typeof taskRecordSchema>;
export const taskInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.uuid().nullable(), task: taskDraftSchema }).strict(),
  z
    .object({ action: z.literal('status'), revision: z.uuid(), id: z.uuid(), status: z.enum(['open', 'completed']) })
    .strict(),
  z.object({ action: z.literal('delete'), revision: z.uuid(), id: z.uuid() }).strict(),
]);
export type TaskInput = z.infer<typeof taskInputSchema>;
export const emptyTasks = (): TaskRecord => ({ schemaVersion: 1, revision: null, tasks: [] });
export function taskTargetHref(target: TaskTarget): string | null {
  if (target.type === 'none') return null;
  if (target.type === 'item') return `/storage?${new URLSearchParams({ find: target.ref })}`;
  if (target.type === 'base') return `/holdings?view=${target.view}#base-${target.ref}`;
  if (target.type === 'vehicle') return `/vehicles?view=${target.view}#vehicle-${target.ref}`;
  return `/tasks?focus=${target.ref}#task-${target.ref}`;
}
export function taskDraftHref(target: TaskTarget): string | null {
  if (!taskTargetSchema.safeParse(target).success || ['project', 'goal'].includes(target.type)) return null;
  const query = new URLSearchParams({ target: target.type });
  if ('ref' in target) query.set('ref', target.ref);
  if ('label' in target) query.set('label', target.label);
  if ('view' in target) query.set('view', target.view);
  return `/tasks?${query}#task-editor`;
}
export function taskSeed(query: Record<string, string | string[] | undefined>): TaskTarget | null {
  const type = query.target;
  const parsed = taskTargetSchema.safeParse(
    type === 'item'
      ? { type, ref: query.ref, label: query.label }
      : type === 'base' || type === 'vehicle'
        ? { type, ref: query.ref, label: query.label, view: query.view }
        : null,
  );
  return parsed.success ? parsed.data : null;
}
