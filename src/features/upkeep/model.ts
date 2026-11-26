import { z } from 'zod';

/**
 * Private base-upkeep plans (N021–N030). Everything here is planning data owned by one dashboard
 * account and linked character: nothing in this record performs, schedules or confirms a game action.
 */
export const UPKEEP_LIMITS = {
  bases: 20,
  minimums: 12,
  checklist: 20,
  inspections: 10,
  containers: 160,
  reminders: 40,
  completions: 20,
  blueprints: 24,
  relocations: 5,
  packing: 60,
  cargo: 12,
  tasks: 40,
  recordBytes: 256 * 1024,
  bodyBytes: 16 * 1024,
} as const;

export const CONTAINER_ZONES = ['Building', 'Medical', 'Fuel', 'Expedition', 'Water', 'Crafting', 'Other'] as const;
export type ContainerZone = (typeof CONTAINER_ZONES)[number];
const CHECK_KINDS = ['water', 'power', 'supplies', 'access', 'custom'] as const;
export type CheckKind = (typeof CHECK_KINDS)[number];

const assetId = z.string().regex(/^[1-9][0-9]{0,15}$/);
const uuid = z.uuid();
const line = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Control characters are not allowed.');
const notes = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(
      (value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value),
      'Control characters are not allowed.',
    );
/** Quantities stay exact decimal strings; game stacks can exceed safe JavaScript integers. */
export const quantitySchema = z.string().regex(/^(0|[1-9][0-9]{0,11})$/);
const timestamp = z.iso.datetime();
const unique = <T>(values: T[], key: (value: T) => string) =>
  new Set(values.map((value) => key(value).toLowerCase())).size === values.length;

const minimumSchema = z.object({ templateId: line(128), name: line(200), minimum: quantitySchema }).strict();
export const checkItemSchema = z.object({ id: uuid, label: line(120), kind: z.enum(CHECK_KINDS) }).strict();
const inspectionResultSchema = z
  .object({ itemId: uuid, status: z.enum(['ok', 'attention', 'skipped']), note: notes(300) })
  .strict();
const inspectionSchema = z
  .object({
    at: timestamp,
    results: z.array(inspectionResultSchema).max(UPKEEP_LIMITS.checklist),
  })
  .strict();

const baseSettingsFields = {
  baseId: assetId,
  /** N022: alert at or below this reported water percentage. Null keeps the 10% default. */
  waterAlertPercent: z.number().int().min(1).max(99).nullable(),
  /** N023: remind when reported generator runtime falls at or below this many hours. */
  generatorAlertHours: z.number().int().min(1).max(720).nullable(),
  /** N026: inspection cadence; null means inspections are recorded but never due. */
  inspectEveryDays: z.number().int().min(1).max(90).nullable(),
  minimums: z
    .array(minimumSchema)
    .max(UPKEEP_LIMITS.minimums)
    .refine((values) => unique(values, (value) => value.templateId), 'Each item can have one minimum.'),
  checklist: z
    .array(checkItemSchema)
    .max(UPKEEP_LIMITS.checklist)
    .refine((values) => unique(values, (value) => value.id), 'Checklist items must be unique.'),
};
export const baseSettingsInputSchema = z.object(baseSettingsFields).strict();
export const baseUpkeepSchema = z
  .object({
    ...baseSettingsFields,
    inspections: z.array(inspectionSchema).max(UPKEEP_LIMITS.inspections),
    updatedAt: timestamp,
  })
  .strict();

const containerLabelSchema = z
  .object({ baseId: assetId, containerId: assetId, alias: line(60), zone: z.enum(CONTAINER_ZONES) })
  .strict();

const reminderInputSchema = z
  .object({
    id: uuid,
    title: line(120),
    baseId: assetId.nullable(),
    everyDays: z.number().int().min(1).max(365),
    firstDueAt: timestamp,
    notes: notes(500),
  })
  .strict();
export const reminderSchema = reminderInputSchema
  .extend({ completions: z.array(timestamp).max(UPKEEP_LIMITS.completions), createdAt: timestamp })
  .strict();

const pieceTypeSchema = z.object({ type: line(200), count: z.number().int().min(1).max(10_000) }).strict();
export const blueprintSummarySchema = z
  .object({
    pieces: z.number().int().min(1).max(10_000),
    placeables: z.number().int().min(0).max(5000),
    baseType: line(80),
    map: line(80),
    types: z.array(pieceTypeSchema).max(40),
    otherTypes: z.number().int().min(0).max(10_000),
    width: z.number().finite().min(0).max(1e9),
    depth: z.number().finite().min(0).max(1e9),
    height: z.number().finite().min(0).max(1e9),
    /** Top-down footprint sample normalised to 0–1000 for side-by-side previews. */
    footprint: z.array(z.tuple([z.number().int().min(0).max(1000), z.number().int().min(0).max(1000)])).max(200),
  })
  .strict();
const blueprintMetaSchema = z
  .object({ id: uuid, design: line(80), label: line(60), description: notes(1000) })
  .strict();
export const blueprintRevisionSchema = blueprintMetaSchema
  .extend({ summary: blueprintSummarySchema, createdAt: timestamp })
  .strict();

const doneLine = (max: number) => z.object({ id: uuid, label: line(max), done: z.boolean() }).strict();
export const relocationInputSchema = z
  .object({
    id: uuid,
    title: line(120),
    fromBaseId: assetId.nullable(),
    destination: notes(1000),
    status: z.enum(['planning', 'moving', 'complete']),
    packing: z.array(doneLine(120).extend({ quantity: quantitySchema.nullable() }).strict()).max(UPKEEP_LIMITS.packing),
    cargo: z
      .array(z.object({ id: uuid, vehicle: line(80), load: notes(300), done: z.boolean() }).strict())
      .max(UPKEEP_LIMITS.cargo),
    tasks: z.array(doneLine(160)).max(UPKEEP_LIMITS.tasks),
  })
  .strict();
export const relocationSchema = relocationInputSchema.extend({ updatedAt: timestamp }).strict();

export const upkeepRecordSchema = z
  .object({
    revision: uuid.nullable(),
    bases: z
      .array(baseUpkeepSchema)
      .max(UPKEEP_LIMITS.bases)
      .refine((values) => unique(values, (value) => value.baseId)),
    containers: z
      .array(containerLabelSchema)
      .max(UPKEEP_LIMITS.containers)
      .refine((values) => unique(values, (value) => `${value.baseId}:${value.containerId}`)),
    reminders: z
      .array(reminderSchema)
      .max(UPKEEP_LIMITS.reminders)
      .refine((values) => unique(values, (value) => value.id)),
    blueprints: z
      .array(blueprintRevisionSchema)
      .max(UPKEEP_LIMITS.blueprints)
      .refine((values) => unique(values, (value) => value.id)),
    relocations: z
      .array(relocationSchema)
      .max(UPKEEP_LIMITS.relocations)
      .refine((values) => unique(values, (value) => value.id)),
  })
  .strict();

export type BaseUpkeep = z.infer<typeof baseUpkeepSchema>;
export type BaseSettingsInput = z.infer<typeof baseSettingsInputSchema>;
export type ContainerLabel = z.infer<typeof containerLabelSchema>;
export type Reminder = z.infer<typeof reminderSchema>;
export type ReminderInput = z.infer<typeof reminderInputSchema>;
export type BlueprintSummary = z.infer<typeof blueprintSummarySchema>;
export type BlueprintRevision = z.infer<typeof blueprintRevisionSchema>;
export type Relocation = z.infer<typeof relocationSchema>;
export type RelocationInput = z.infer<typeof relocationInputSchema>;
export type UpkeepRecord = z.infer<typeof upkeepRecordSchema>;
export type CheckItem = z.infer<typeof checkItemSchema>;

export const emptyUpkeep = (): UpkeepRecord => ({
  revision: null,
  bases: [],
  containers: [],
  reminders: [],
  blueprints: [],
  relocations: [],
});

const revision = uuid.nullable();
export const upkeepActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('base'), revision, base: baseSettingsInputSchema }).strict(),
  z.object({ action: z.literal('base-remove'), revision, baseId: assetId }).strict(),
  z
    .object({
      action: z.literal('inspect'),
      revision,
      baseId: assetId,
      results: z.array(inspectionResultSchema).min(1).max(UPKEEP_LIMITS.checklist),
    })
    .strict(),
  z.object({ action: z.literal('container'), revision, label: containerLabelSchema }).strict(),
  z.object({ action: z.literal('container-remove'), revision, baseId: assetId, containerId: assetId }).strict(),
  z.object({ action: z.literal('reminder'), revision, reminder: reminderInputSchema }).strict(),
  z.object({ action: z.literal('reminder-complete'), revision, id: uuid }).strict(),
  z.object({ action: z.literal('reminder-remove'), revision, id: uuid }).strict(),
  z.object({ action: z.literal('blueprint-meta'), revision, blueprint: blueprintMetaSchema }).strict(),
  z.object({ action: z.literal('blueprint-remove'), revision, id: uuid }).strict(),
  z.object({ action: z.literal('relocation'), revision, relocation: relocationInputSchema }).strict(),
  z.object({ action: z.literal('relocation-remove'), revision, id: uuid }).strict(),
]);
export type UpkeepAction = z.infer<typeof upkeepActionSchema>;

/** The blueprint route carries the layout file separately so ordinary edits stay small. */
export const blueprintUploadSchema = z
  .object({
    revision,
    blueprint: blueprintMetaSchema,
    layout: z
      .string()
      .min(2)
      .max(2 * 1024 * 1024),
  })
  .strict();

/** The four N026 essentials. IDs are fixed so default checklists stay stable across saves. */
export const DEFAULT_CHECKLIST: CheckItem[] = [
  { id: '6f1f6f4e-1d0a-4c55-9a51-0c3f5a3f0a01', label: 'Water level and condensers', kind: 'water' },
  { id: '6f1f6f4e-1d0a-4c55-9a51-0c3f5a3f0a02', label: 'Generator fuel and power', kind: 'power' },
  { id: '6f1f6f4e-1d0a-4c55-9a51-0c3f5a3f0a03', label: 'Supplies against minimums', kind: 'supplies' },
  { id: '6f1f6f4e-1d0a-4c55-9a51-0c3f5a3f0a04', label: 'Doors and access checked in game', kind: 'access' },
];
export const checklistFor = (base: Pick<BaseUpkeep, 'checklist'> | undefined): CheckItem[] =>
  base?.checklist.length ? base.checklist : DEFAULT_CHECKLIST;
export const DEFAULT_WATER_ALERT_PERCENT = 10;
export const DEFAULT_GENERATOR_ALERT_HOURS = 24;

export const upkeepViews = ['care', 'bases', 'reminders', 'blueprints', 'relocation'] as const;
export type UpkeepView = (typeof upkeepViews)[number];
export const parseUpkeepView = (value: unknown): UpkeepView =>
  upkeepViews.includes(value as UpkeepView) ? (value as UpkeepView) : 'care';

export const nextReminderDue = (reminder: Pick<Reminder, 'completions' | 'everyDays' | 'firstDueAt'>): string => {
  const last = reminder.completions.at(-1);
  return last ? new Date(Date.parse(last) + reminder.everyDays * 86_400_000).toISOString() : reminder.firstDueAt;
};
