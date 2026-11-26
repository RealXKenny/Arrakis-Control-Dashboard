import { z } from 'zod';
import {
  briefingsSchema,
  operationKinds,
  operationSlotsSchema,
  preparationSchema,
  waypointsSchema,
  type OperationDraft,
  type StoredOperation,
} from './operations';
import { clockPattern, parseClock, validTimeZone, zonedDate, zonedToUtc } from './zoned-time';

export const TEMPLATE_LIMIT = 20;
export const templateCadences = ['none', 'weekly', 'fortnightly'] as const;
export const templateCadenceLabel = { none: 'No fixed schedule', weekly: 'Weekly', fortnightly: 'Every two weeks' };

const draftFields = {
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(operationKinds),
  title: z.string().trim().min(1).max(100),
  details: z.string().trim().max(2000),
  meetingPoint: z.string().trim().min(1).max(200),
  durationMinutes: z.number().int().min(15).max(1440),
  roles: operationSlotsSchema,
  preparation: preparationSchema,
  briefings: briefingsSchema,
  waypoints: waypointsSchema,
  notes: z.string().trim().max(1000),
  cadence: z.enum(templateCadences),
  weekday: z.number().int().min(0).max(6).nullable(),
  time: z.string().regex(clockPattern).nullable(),
  timeZone: z.string().max(80).refine(validTimeZone).nullable(),
};
const cadenceComplete = (value: {
  cadence: string;
  weekday?: number | null;
  time?: string | null;
  timeZone?: string | null;
}) => value.cadence === 'none' || (value.weekday != null && value.time != null && value.timeZone != null);
export const templateDraftSchema = z
  .object(draftFields)
  .strict()
  .refine(cadenceComplete, { message: 'Recurring templates need a weekday, time and timezone.' });
export const storedTemplateSchema = z
  .object({ ...draftFields, updatedBy: z.string().min(1).max(200), updatedAt: z.iso.datetime() })
  .strict()
  .refine(cadenceComplete);
export const templatesDocumentSchema = z
  .object({
    revision: z.uuid(),
    templates: z
      .array(storedTemplateSchema)
      .max(TEMPLATE_LIMIT)
      .refine((values) => new Set(values.map((entry) => entry.id)).size === values.length),
  })
  .strict();
export const templatesViewSchema = z.object({
  revision: z.uuid().nullable(),
  canEdit: z.boolean(),
  templates: z.array(storedTemplateSchema).max(TEMPLATE_LIMIT),
});
export const templateInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.uuid().nullable(), template: templateDraftSchema }).strict(),
  z.object({ action: z.literal('delete'), revision: z.uuid(), id: z.uuid() }).strict(),
]);
export type TemplateDraft = z.infer<typeof templateDraftSchema>;
export type StoredTemplate = z.infer<typeof storedTemplateSchema>;
export type TemplatesDocument = z.infer<typeof templatesDocumentSchema>;
export type TemplateInput = z.infer<typeof templateInputSchema>;
export type TemplatesView = z.infer<typeof templatesViewSchema>;

/**
 * Next suggested start for a recurring template, at least `leadMs` from now. Fortnightly templates
 * anchor to the latest operation already scheduled from them. This only suggests a time: the leader
 * still reviews and saves each operation, and nothing is created automatically.
 */
export function nextTemplateStart(
  template: Pick<StoredTemplate, 'cadence' | 'weekday' | 'time' | 'timeZone'>,
  now: number,
  lastStart: string | null = null,
  leadMs = 15 * 60_000,
): number | null {
  if (template.cadence === 'none' || template.weekday === null || !template.time || !template.timeZone) return null;
  const clock = parseClock(template.time);
  const earliest = Math.max(
    now + leadMs,
    template.cadence === 'fortnightly' && lastStart ? Date.parse(lastStart) + 13 * 86_400_000 : 0,
  );
  for (let offset = 0; offset < 30; offset += 1) {
    const date = zonedDate(earliest, template.timeZone, offset);
    if (date.weekday !== template.weekday) continue;
    const start = zonedToUtc(date, clock, template.timeZone);
    if (start >= earliest) return start;
  }
  return null;
}

/** Fresh IDs keep readiness ticks and convoy references from crossing between operations. */
export function operationFromTemplate(template: StoredTemplate, startsAt: number, newId: () => string): OperationDraft {
  const waypointIds = new Map(template.waypoints.map((entry) => [entry.id, newId()]));
  return {
    id: newId(),
    title: template.title,
    kind: template.kind,
    details: template.details,
    meetingPoint: template.meetingPoint,
    startsAt: new Date(startsAt).toISOString(),
    endsAt: new Date(startsAt + template.durationMinutes * 60_000).toISOString(),
    roles: template.roles,
    preparation: template.preparation.map((entry) => ({ ...entry, id: newId() })),
    briefings: template.briefings,
    waypoints: template.waypoints.map((entry) => ({ ...entry, id: waypointIds.get(entry.id)! })),
    templateId: template.id,
  };
}

export function templateFromOperation(
  operation: Pick<
    StoredOperation,
    | 'title'
    | 'kind'
    | 'details'
    | 'meetingPoint'
    | 'startsAt'
    | 'endsAt'
    | 'roles'
    | 'preparation'
    | 'briefings'
    | 'waypoints'
  >,
  id: string,
): TemplateDraft {
  return {
    id,
    name: operation.title.slice(0, 80),
    kind: operation.kind,
    title: operation.title,
    details: operation.details,
    meetingPoint: operation.meetingPoint,
    durationMinutes: Math.max(
      15,
      Math.min(1440, Math.round((Date.parse(operation.endsAt) - Date.parse(operation.startsAt)) / 60_000)),
    ),
    roles: operation.roles,
    preparation: operation.preparation ?? [],
    briefings: operation.briefings ?? {},
    waypoints: operation.waypoints ?? [],
    notes: '',
    cadence: 'none',
    weekday: null,
    time: null,
    timeZone: null,
  };
}
