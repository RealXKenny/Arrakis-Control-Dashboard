import { z } from 'zod';

/** Private per-account, per-linked-character progression planner (N011–N019). Browser-safe. */
export const PROGRESSION_LIMITS = {
  goals: 40,
  pinnedGoals: 8,
  research: 60,
  builds: 10,
  buildTargets: 12,
  recipes: 60,
  journeyPins: 20,
  checklist: 30,
  notes: 40,
  noteLinks: 5,
  noteTags: 5,
} as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max);
/** Exact whole-number targets stay decimal strings so large Solari or reputation values never lose precision. */
export const wholeNumber = z.string().regex(/^(0|[1-9][0-9]{0,29})$/);
export const characterIdSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const timestamps = { createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() };

export const goalKinds = ['level', 'faction', 'specialization', 'journey', 'solari', 'custom'] as const;
export type GoalKind = (typeof goalKinds)[number];
export const goalDraftSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(goalKinds),
    title: text(80),
    /** Faction name, specialization track or journey node ID. Empty for level, Solari and custom goals. */
    ref: optionalText(128),
    /** Required for numeric kinds; empty for journey and custom goals. */
    target: z.union([wholeNumber, z.literal('')]),
    /** Which read-only balance a Solari savings goal compares with. */
    balance: z.enum(['credit', 'pocket']).nullable(),
    pinned: z.boolean(),
    /** Only custom goals are completed by hand; every other kind derives completion from a fresh reading. */
    done: z.boolean(),
    note: optionalText(500),
  })
  .strict()
  .refine((goal) => (['faction', 'specialization', 'journey'].includes(goal.kind) ? goal.ref.length > 0 : true), {
    message: 'Choose what this goal tracks.',
  })
  .refine((goal) => (['journey', 'custom'].includes(goal.kind) ? goal.target === '' : goal.target !== ''), {
    message: 'Enter a whole-number target.',
  })
  .refine((goal) => (goal.kind === 'solari') === (goal.balance !== null), { message: 'Choose a balance.' })
  .refine((goal) => goal.kind === 'custom' || !goal.done, { message: 'Only custom goals are completed by hand.' });
export type GoalDraft = z.infer<typeof goalDraftSchema>;

export const researchDraftSchema = z
  .object({
    id: z.uuid(),
    name: text(80),
    status: z.enum(['wanted', 'in-progress', 'unlocked']),
    priority: z.enum(['high', 'normal', 'low']),
    note: optionalText(500),
  })
  .strict();
export type ResearchDraft = z.infer<typeof researchDraftSchema>;

export const buildDraftSchema = z
  .object({
    id: z.uuid(),
    name: text(60),
    purpose: optionalText(300),
    targets: z
      .array(z.object({ track: text(80), level: z.number().int().min(0).max(999) }).strict())
      .min(1)
      .max(PROGRESSION_LIMITS.buildTargets)
      .refine((targets) => new Set(targets.map((t) => t.track.toLowerCase())).size === targets.length, {
        message: 'List each specialization once.',
      }),
  })
  .strict();
export type BuildDraft = z.infer<typeof buildDraftSchema>;

export const recipeDraftSchema = z
  .object({
    id: z.uuid(),
    name: text(80),
    acquired: z.boolean(),
    materials: optionalText(300),
    note: optionalText(500),
  })
  .strict();
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

export const journeyPinDraftSchema = z.object({ id: z.uuid(), nodeId: text(128), note: optionalText(500) }).strict();
export type JourneyPinDraft = z.infer<typeof journeyPinDraftSchema>;

export const checklistDraftSchema = z.object({ id: z.uuid(), text: text(160), done: z.boolean() }).strict();
export type ChecklistDraft = z.infer<typeof checklistDraftSchema>;

/**
 * Notebook links stay inside the dashboard workspace. A saved link never proves ownership or grants access: the
 * destination page re-checks the session, linked character and permissions.
 */
export const NOTE_LINK_PATTERN =
  /^\/(holdings|vehicles|storage|character|bases|map|tasks|calendar|progression|market)(\/[A-Za-z0-9._~-]{1,80}){0,3}(\?[A-Za-z0-9=&._~%+-]{1,200})?(#[A-Za-z0-9_-]{1,80})?$/;
export const noteLinkSchema = z
  .object({ label: text(60), href: z.string().max(400).regex(NOTE_LINK_PATTERN) })
  .strict()
  .refine((link) => !link.href.includes('..') && !link.href.startsWith('//'));
export const noteDraftSchema = z
  .object({
    id: z.uuid(),
    title: text(100),
    body: optionalText(4000),
    tags: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[\p{L}\p{N} _-]{1,24}$/u),
      )
      .max(PROGRESSION_LIMITS.noteTags)
      .refine((tags) => new Set(tags.map((tag) => tag.toLowerCase())).size === tags.length),
    links: z.array(noteLinkSchema).max(PROGRESSION_LIMITS.noteLinks),
  })
  .strict();
export type NoteDraft = z.infer<typeof noteDraftSchema>;

const unique = <T extends { id: string }>(rows: T[]) => new Set(rows.map((row) => row.id)).size === rows.length;

export const plannerRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z.uuid().nullable(),
    tracking: z.object({ enabled: z.boolean(), startedAt: z.iso.datetime().nullable() }).strict(),
    goals: z.array(goalDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.goals),
    research: z.array(researchDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.research),
    builds: z.array(buildDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.builds),
    recipes: z.array(recipeDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.recipes),
    journeyPins: z.array(journeyPinDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.journeyPins),
    checklist: z.array(checklistDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.checklist),
    notes: z.array(noteDraftSchema.safeExtend(timestamps)).max(PROGRESSION_LIMITS.notes),
  })
  .strict()
  .refine((record) => record.goals.filter((goal) => goal.pinned).length <= PROGRESSION_LIMITS.pinnedGoals)
  .refine(
    (record) =>
      unique(record.goals) &&
      unique(record.research) &&
      unique(record.builds) &&
      unique(record.recipes) &&
      unique(record.journeyPins) &&
      unique(record.checklist) &&
      unique(record.notes),
  )
  .refine(
    (record) => new Set(record.journeyPins.map((pin) => pin.nodeId.toLowerCase())).size === record.journeyPins.length,
  );
export type PlannerRecord = z.infer<typeof plannerRecordSchema>;
export type StoredGoal = PlannerRecord['goals'][number];

export const plannerCollections = [
  'goals',
  'research',
  'builds',
  'recipes',
  'journeyPins',
  'checklist',
  'notes',
] as const;
export type PlannerCollection = (typeof plannerCollections)[number];

const base = { revision: z.uuid().nullable(), character: characterIdSchema };
export const plannerInputSchema = z.discriminatedUnion('action', [
  z.object({ ...base, action: z.literal('save-goal'), item: goalDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('save-research'), item: researchDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('save-build'), item: buildDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('save-recipe'), item: recipeDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('save-journey-pin'), item: journeyPinDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('save-checklist'), item: checklistDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('save-note'), item: noteDraftSchema }).strict(),
  z.object({ ...base, action: z.literal('delete'), collection: z.enum(plannerCollections), id: z.uuid() }).strict(),
  z.object({ ...base, action: z.literal('set-tracking'), enabled: z.boolean() }).strict(),
]);
export type PlannerInput = z.infer<typeof plannerInputSchema>;
export const saveActionCollection: Record<
  Exclude<PlannerInput['action'], 'delete' | 'set-tracking'>,
  PlannerCollection
> = {
  'save-goal': 'goals',
  'save-research': 'research',
  'save-build': 'builds',
  'save-recipe': 'recipes',
  'save-journey-pin': 'journeyPins',
  'save-checklist': 'checklist',
  'save-note': 'notes',
};

export const emptyPlanner = (): PlannerRecord => ({
  schemaVersion: 1,
  revision: null,
  tracking: { enabled: false, startedAt: null },
  goals: [],
  research: [],
  builds: [],
  recipes: [],
  journeyPins: [],
  checklist: [],
  notes: [],
});

export const journalInputSchema = z
  .object({ action: z.enum(['auto', 'record', 'clear']), revision: z.uuid().nullable(), character: characterIdSchema })
  .strict();
export type JournalInput = z.infer<typeof journalInputSchema>;
