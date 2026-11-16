import { z } from 'zod';
import { personalPortalLayout, portalLayoutSchema } from '../portal/layout';
export const activityDefinitionSchema = z
  .object({
    portal: portalLayoutSchema,
    map: z.enum(['HaggaBasin', 'DeepDesert']),
    inbox: z
      .object({
        category: z.enum(['all', 'assets', 'supply', 'market', 'operations']),
        urgent: z.boolean(),
        showMuted: z.boolean(),
      })
      .strict(),
    tasks: z
      .object({
        status: z.enum(['all', 'open', 'completed']),
        kind: z.enum(['all', 'task', 'project', 'goal']),
        query: z.string().trim().max(200),
      })
      .strict(),
    planning: z
      .object({ kind: z.enum(['project', 'goal']), id: z.uuid() })
      .strict()
      .nullable(),
  })
  .strict();
export type ActivityDefinition = z.infer<typeof activityDefinitionSchema>;
export const activityViewSchema = activityDefinitionSchema
  .extend({ id: z.uuid(), name: z.string().trim().min(1).max(60) })
  .strict();
export type ActivityView = z.infer<typeof activityViewSchema>;
export const activityRecordSchema = z
  .object({ schemaVersion: z.literal(1), revision: z.uuid().nullable(), views: z.array(activityViewSchema).max(12) })
  .strict()
  .refine((r) => new Set(r.views.map((v) => v.id)).size === r.views.length)
  .refine((r) => new Set(r.views.map((v) => v.name.toLocaleLowerCase('en-US'))).size === r.views.length);
export type ActivityRecord = z.infer<typeof activityRecordSchema>;
export const activityInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.uuid().nullable(), view: activityViewSchema }).strict(),
  z.object({ action: z.literal('delete'), revision: z.uuid(), id: z.uuid(), confirmed: z.literal(true) }).strict(),
]);
export type ActivityInput = z.infer<typeof activityInputSchema>;
export const planOptionSchema = z
  .object({ id: z.uuid(), kind: z.enum(['project', 'goal']), title: z.string().max(120) })
  .strict();
export const activityEnvelopeSchema = z
  .object({ record: activityRecordSchema, plans: z.array(planOptionSchema).max(100), planningAvailable: z.boolean() })
  .strict();
export const emptyActivities = (): ActivityRecord => ({ schemaVersion: 1, revision: null, views: [] });
export const defaultActivity = (): ActivityDefinition => ({
  portal: personalPortalLayout(),
  map: 'HaggaBasin',
  inbox: { category: 'all', urgent: false, showMuted: false },
  tasks: { status: 'open', kind: 'all', query: '' },
  planning: null,
});
export function activityHref(area: 'portal' | 'inbox' | 'tasks', id: string) {
  return z.uuid().safeParse(id).success ? `/${area}?activity=${id}` : `/${area}`;
}
