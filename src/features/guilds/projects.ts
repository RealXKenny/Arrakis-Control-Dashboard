import { z } from 'zod';

/**
 * N051–N060 guild projects, crafting and shared supplies.
 * Browser-safe contracts and the pure change engine. Every record is planning metadata only:
 * nothing here moves, locks, crafts or purchases game items or currency.
 */
const PROJECT_LIMIT = 15;
export const PROJECT_MILESTONE_LIMIT = 20;
export const PROJECT_MATERIAL_LIMIT = 30;
const PROJECT_ASSIGNMENT_LIMIT = 60;
const PROJECT_RESERVATION_LIMIT = 60;
const PROJECT_CONTRIBUTION_LIMIT = 100;
const PROJECT_CORRECTION_LIMIT = 10;
const PROJECT_COST_LIMIT = 40;
const STOCK_LIMIT = 200;
export const STOCK_MEMBER_LIMIT = 25;
const SPECIALIST_LIMIT = 200;
export const SPECIALIST_CAPABILITY_LIMIT = 12;
const COMMISSION_LIMIT = 100;
const COMMISSION_OPEN_LIMIT = 5;
const COMMISSION_EVENT_LIMIT = 20;
const COMMISSION_CLOSED_RETENTION_MS = 90 * 86_400_000;
/** A just-prepared resource-request link blocks a second draft while the request is being created. */
const REQUEST_LINK_GRACE_MS = 60_000;

export const projectGuildIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const memberKeySchema = z.string().regex(/^[a-f0-9]{64}$/);
export const projectQuantitySchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,17}$/, 'Enter a whole quantity of up to 18 digits.');
export const solariAmountSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d{0,17})$/, 'Enter whole Solari of up to 18 digits.');
const templateIdSchema = z
  .string()
  .trim()
  .regex(/^[\w./:-]{1,200}$/);
const text = (max: number) => z.string().trim().max(max);
const required = (max: number) => z.string().trim().min(1).max(max);
const iso = z.iso.datetime();
const day = z.iso.date();

export const PROJECT_STATUSES = ['planning', 'active', 'completed', 'cancelled'] as const;
export const CRAFT_CATEGORIES = [
  'weapons',
  'armor',
  'tools',
  'vehicles',
  'building',
  'consumables',
  'refining',
  'other',
] as const;
export const SPECIALIST_AVAILABILITY = ['available', 'limited', 'unavailable'] as const;
const COMMISSION_STATUSES = ['requested', 'accepted', 'claimed', 'received', 'cancelled'] as const;

/* ------------------------------------------------------------------ stored records */

const milestoneSchema = z
  .object({
    id: z.uuid(),
    title: required(120),
    due: day.nullable(),
    responsibleKey: memberKeySchema.nullable(),
    completedAt: iso.nullable(),
    completedByName: required(200).nullable(),
  })
  .strict();
const estimateSchema = z
  .object({
    unitPrice: solariAmountSchema.nullable(),
    listingCount: z.number().int().min(0).max(500),
    stock: solariAmountSchema,
    partial: z.boolean(),
    observedAt: iso,
  })
  .strict();
const materialSchema = z
  .object({
    id: z.uuid(),
    name: required(100),
    unit: required(30),
    required: projectQuantitySchema,
    templateId: templateIdSchema.nullable(),
    responsibleKey: memberKeySchema.nullable(),
    requestId: z.uuid().nullable(),
    requestLinkedAt: iso.nullable(),
    estimate: estimateSchema.nullable(),
  })
  .strict();
const assignmentSchema = z
  .object({
    id: z.uuid(),
    materialId: z.uuid(),
    memberKey: memberKeySchema,
    memberName: required(200),
    quantity: projectQuantitySchema,
    status: z.enum(['assigned', 'purchased', 'delivered']),
    assignedByName: required(200),
    updatedAt: iso,
  })
  .strict();
const reservationSchema = z
  .object({
    id: z.uuid(),
    materialId: z.uuid(),
    stockId: z.uuid(),
    quantity: projectQuantitySchema,
    reservedByKey: memberKeySchema,
    reservedByName: required(200),
    createdAt: iso,
  })
  .strict();
const sourceSchema = z
  .object({ kind: z.enum(['assignment', 'reservation']), id: z.uuid() })
  .strict()
  .nullable();
const correctionSchema = z
  .object({
    at: iso,
    byName: required(200),
    reason: required(300),
    previous: z
      .object({
        quantity: projectQuantitySchema.nullable(),
        summary: required(300),
        evidence: required(500),
        status: z.enum(['submitted', 'accepted', 'rejected']),
      })
      .strict(),
  })
  .strict();
const contributionSchema = z
  .object({
    id: z.uuid(),
    materialId: z.uuid().nullable(),
    memberKey: memberKeySchema,
    memberName: required(200),
    quantity: projectQuantitySchema.nullable(),
    summary: required(300),
    evidence: required(500),
    source: sourceSchema,
    status: z.enum(['submitted', 'accepted', 'rejected']),
    submittedAt: iso,
    reviewedAt: iso.nullable(),
    reviewedByKey: memberKeySchema.nullable(),
    reviewedByName: required(200).nullable(),
    reviewNote: text(300),
    history: z.array(correctionSchema).max(PROJECT_CORRECTION_LIMIT),
  })
  .strict();
const costSchema = z
  .object({
    id: z.uuid(),
    label: required(100),
    amount: solariAmountSchema,
    note: text(300),
    recordedByName: required(200),
    recordedAt: iso,
  })
  .strict();
const projectSchema = z
  .object({
    id: z.uuid(),
    revision: z.uuid(),
    name: required(100),
    summary: text(1000),
    status: z.enum(PROJECT_STATUSES),
    createdAt: iso,
    updatedAt: iso,
    createdByName: required(200),
    milestones: z.array(milestoneSchema).max(PROJECT_MILESTONE_LIMIT),
    materials: z.array(materialSchema).max(PROJECT_MATERIAL_LIMIT),
    assignments: z.array(assignmentSchema).max(PROJECT_ASSIGNMENT_LIMIT),
    reservations: z.array(reservationSchema).max(PROJECT_RESERVATION_LIMIT),
    contributions: z.array(contributionSchema).max(PROJECT_CONTRIBUTION_LIMIT),
    costs: z.array(costSchema).max(PROJECT_COST_LIMIT),
  })
  .strict();
const stockSchema = z
  .object({
    id: z.uuid(),
    revision: z.uuid(),
    ownerKey: memberKeySchema,
    ownerName: required(200),
    material: required(100),
    unit: required(30),
    quantity: projectQuantitySchema,
    templateId: templateIdSchema.nullable(),
    location: text(120),
    note: text(300),
    publishedAt: iso,
    updatedAt: iso,
  })
  .strict();
const capabilitySchema = z
  .object({ id: z.uuid(), category: z.enum(CRAFT_CATEGORIES), items: required(300), note: text(200) })
  .strict();
const specialistSchema = z
  .object({
    revision: z.uuid(),
    ownerKey: memberKeySchema,
    ownerName: required(200),
    availability: z.enum(SPECIALIST_AVAILABILITY),
    note: text(500),
    capabilities: z.array(capabilitySchema).min(1).max(SPECIALIST_CAPABILITY_LIMIT),
    updatedAt: iso,
  })
  .strict();
const commissionEventSchema = z
  .object({
    at: iso,
    byName: required(200),
    event: z.enum(['requested', 'edited', 'accepted', 'declined', 'claimed', 'received', 'disputed', 'cancelled']),
    note: text(300),
  })
  .strict();
const commissionSchema = z
  .object({
    id: z.uuid(),
    revision: z.uuid(),
    requesterKey: memberKeySchema,
    requesterName: required(200),
    item: required(100),
    quantity: projectQuantitySchema,
    details: text(1000),
    inputs: text(1000),
    agreedInputs: text(1000).nullable(),
    crafterKey: memberKeySchema.nullable(),
    crafterName: required(200).nullable(),
    status: z.enum(COMMISSION_STATUSES),
    createdAt: iso,
    updatedAt: iso,
    acceptedAt: iso.nullable(),
    claimedAt: iso.nullable(),
    claimNote: text(300),
    receivedAt: iso.nullable(),
    receiptNote: text(300),
    events: z.array(commissionEventSchema).max(COMMISSION_EVENT_LIMIT),
  })
  .strict();

export const guildProjectsBookSchema = z
  .object({
    version: z.literal(1),
    guildId: projectGuildIdSchema,
    updatedAt: iso.nullable(),
    projects: z.array(projectSchema).max(PROJECT_LIMIT),
    stockpile: z.array(stockSchema).max(STOCK_LIMIT),
    specialists: z.array(specialistSchema).max(SPECIALIST_LIMIT),
    commissions: z.array(commissionSchema).max(COMMISSION_LIMIT),
  })
  .strict()
  .superRefine((book, issue) => {
    const problem = bookProblem(book);
    if (problem) issue.addIssue({ code: 'custom', message: problem });
  });

export type GuildProjectsBook = z.infer<typeof guildProjectsBookSchema>;
export type GuildProject = GuildProjectsBook['projects'][number];
export type ProjectMaterial = GuildProject['materials'][number];
export type ProjectContribution = GuildProject['contributions'][number];
export type StockEntry = GuildProjectsBook['stockpile'][number];
export type Specialist = GuildProjectsBook['specialists'][number];
export type Commission = GuildProjectsBook['commissions'][number];
export type MaterialEstimate = z.infer<typeof estimateSchema>;

export function emptyProjectsBook(guildId: string): GuildProjectsBook {
  return {
    version: 1,
    guildId: projectGuildIdSchema.parse(guildId),
    updatedAt: null,
    projects: [],
    stockpile: [],
    specialists: [],
    commissions: [],
  };
}

const unique = (values: string[]) => new Set(values).size === values.length;
const sum = (values: string[]) => values.reduce((total, value) => total + BigInt(value), 0n);

/** Cross-record invariants that a single field schema cannot express. Returns null when consistent. */
function bookProblem(book: Omit<GuildProjectsBook, 'version'> & { version: number }): string | null {
  if (!unique(book.projects.map((project) => project.id))) return 'duplicate project';
  if (!unique(book.stockpile.map((entry) => entry.id))) return 'duplicate stock entry';
  if (!unique(book.specialists.map((entry) => entry.ownerKey))) return 'duplicate specialist';
  if (!unique(book.commissions.map((entry) => entry.id))) return 'duplicate commission';
  const owners = new Map<string, number>();
  for (const entry of book.stockpile) owners.set(entry.ownerKey, (owners.get(entry.ownerKey) ?? 0) + 1);
  if ([...owners.values()].some((count) => count > STOCK_MEMBER_LIMIT)) return 'stock member limit';
  const stock = new Map(book.stockpile.map((entry) => [entry.id, entry]));
  const reservedByStock = new Map<string, bigint>();
  for (const project of book.projects) {
    const materials = new Set(project.materials.map((material) => material.id));
    if (!unique([...materials])) return 'duplicate material';
    if (!unique(project.milestones.map((milestone) => milestone.id))) return 'duplicate milestone';
    for (const list of [project.assignments, project.reservations, project.contributions, project.costs])
      if (!unique(list.map((entry) => entry.id))) return 'duplicate record';
    if (project.assignments.some((entry) => !materials.has(entry.materialId))) return 'orphan assignment';
    for (const entry of project.reservations) {
      const source = stock.get(entry.stockId);
      if (!materials.has(entry.materialId) || !source) return 'orphan reservation';
      reservedByStock.set(entry.stockId, (reservedByStock.get(entry.stockId) ?? 0n) + BigInt(entry.quantity));
    }
    for (const entry of project.contributions)
      if (entry.materialId !== null && !materials.has(entry.materialId)) return 'orphan contribution';
    for (const material of project.materials) {
      const coverage = materialCoverage(project, material.id);
      if (
        BigInt(coverage.accepted) + BigInt(coverage.reserved) + BigInt(coverage.procuring) >
        BigInt(material.required)
      )
        return 'over-allocated material';
    }
  }
  for (const [id, reserved] of reservedByStock)
    if (reserved > BigInt(stock.get(id)!.quantity)) return 'over-reserved stock';
  return null;
}

/* ------------------------------------------------------------------ pure calculations */

/**
 * Material coverage keeps the four planning states apart: confirmed (accepted contributions),
 * reserved published stock, outstanding procurement and the remaining shortage.
 */
export function materialCoverage(
  project: Pick<GuildProject, 'materials' | 'assignments' | 'reservations' | 'contributions'>,
  materialId: string,
) {
  const material = project.materials.find((entry) => entry.id === materialId);
  const requiredQuantity = BigInt(material?.required ?? '0');
  const accepted = sum(
    project.contributions
      .filter((entry) => entry.materialId === materialId && entry.status === 'accepted' && entry.quantity)
      .map((entry) => entry.quantity!),
  );
  const reserved = sum(
    project.reservations.filter((entry) => entry.materialId === materialId).map((entry) => entry.quantity),
  );
  const procuring = sum(
    project.assignments
      .filter((entry) => entry.materialId === materialId && entry.status !== 'delivered')
      .map((entry) => entry.quantity),
  );
  const covered = accepted + reserved + procuring;
  return {
    required: requiredQuantity.toString(),
    accepted: accepted.toString(),
    reserved: reserved.toString(),
    procuring: procuring.toString(),
    shortage: (covered >= requiredQuantity ? 0n : requiredQuantity - covered).toString(),
  };
}

/** Sum of reservations held against one published stock entry across every project. */
export function stockReserved(book: Pick<GuildProjectsBook, 'projects'>, stockId: string) {
  return sum(
    book.projects.flatMap((project) =>
      project.reservations.filter((entry) => entry.stockId === stockId).map((entry) => entry.quantity),
    ),
  ).toString();
}

/**
 * N060: three separate cost lines. Observed estimates price only the remaining shortage from the
 * latest stored listing observation; manual costs are what leaders recorded; deliveries are quantities.
 */
export function projectCostSummary(project: GuildProject) {
  let estimated = 0n;
  const unpriced: string[] = [];
  let oldest: string | null = null;
  for (const material of project.materials) {
    const shortage = BigInt(materialCoverage(project, material.id).shortage);
    if (shortage === 0n) continue;
    if (!material.estimate?.unitPrice) {
      unpriced.push(material.name);
      continue;
    }
    estimated += shortage * BigInt(material.estimate.unitPrice);
    if (!oldest || material.estimate.observedAt < oldest) oldest = material.estimate.observedAt;
  }
  return {
    observedEstimate: estimated.toString(),
    estimateObservedSince: oldest,
    unpricedMaterials: unpriced,
    manualCosts: sum(project.costs.map((cost) => cost.amount)).toString(),
    confirmedDeliveries: project.materials.map((material) => ({
      materialId: material.id,
      name: material.name,
      unit: material.unit,
      quantity: materialCoverage(project, material.id).accepted,
    })),
  };
}

/* ------------------------------------------------------------------ inputs */

const target = { id: z.uuid(), revision: z.uuid() };
export const projectDraftSchema = z
  .object({
    id: z.uuid(),
    name: required(100),
    summary: text(1000),
    status: z.enum(PROJECT_STATUSES),
    milestones: z
      .array(
        z
          .object({
            id: z.uuid(),
            title: required(120),
            due: day.nullable(),
            responsibleKey: memberKeySchema.nullable(),
          })
          .strict(),
      )
      .max(PROJECT_MILESTONE_LIMIT),
    materials: z
      .array(
        z
          .object({
            id: z.uuid(),
            name: required(100),
            unit: required(30),
            required: projectQuantitySchema,
            templateId: templateIdSchema.nullable(),
            responsibleKey: memberKeySchema.nullable(),
          })
          .strict(),
      )
      .max(PROJECT_MATERIAL_LIMIT),
  })
  .strict();
export const stockDraftSchema = z
  .object({
    id: z.uuid(),
    material: required(100),
    unit: required(30),
    quantity: projectQuantitySchema,
    templateId: templateIdSchema.nullable(),
    location: text(120),
    note: text(300),
  })
  .strict();
export const specialistDraftSchema = z
  .object({
    availability: z.enum(SPECIALIST_AVAILABILITY),
    note: text(500),
    capabilities: z.array(capabilitySchema).min(1).max(SPECIALIST_CAPABILITY_LIMIT),
  })
  .strict();
export const commissionDraftSchema = z
  .object({
    id: z.uuid(),
    item: required(100),
    quantity: projectQuantitySchema,
    details: text(1000),
    inputs: text(1000),
    crafterKey: memberKeySchema.nullable(),
  })
  .strict();
const contributionDraftSchema = z
  .object({
    id: z.uuid(),
    materialId: z.uuid().nullable(),
    quantity: projectQuantitySchema.nullable(),
    summary: required(300),
    evidence: required(500),
    source: sourceSchema,
  })
  .strict();
const requestDraftSchema = z
  .object({ dropoff: required(200), details: text(1500), priority: z.enum(['normal', 'urgent']) })
  .strict();

export const projectInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('project-save'), revision: z.uuid().nullable(), project: projectDraftSchema }).strict(),
  z.object({ action: z.literal('project-delete'), ...target }).strict(),
  z.object({ action: z.literal('milestone'), ...target, milestoneId: z.uuid(), done: z.boolean() }).strict(),
  z
    .object({ action: z.literal('request-shortage'), ...target, materialId: z.uuid(), request: requestDraftSchema })
    .strict(),
  z.object({ action: z.literal('unlink-request'), ...target, materialId: z.uuid() }).strict(),
  z.object({ action: z.literal('observe-price'), ...target, materialId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('assign'),
      ...target,
      materialId: z.uuid(),
      assignmentId: z.uuid(),
      memberKey: memberKeySchema,
      quantity: projectQuantitySchema,
    })
    .strict(),
  z
    .object({
      action: z.literal('assignment-status'),
      ...target,
      assignmentId: z.uuid(),
      status: z.enum(['assigned', 'purchased']),
    })
    .strict(),
  z.object({ action: z.literal('assignment-remove'), ...target, assignmentId: z.uuid() }).strict(),
  z
    .object({
      action: z.literal('reserve'),
      ...target,
      materialId: z.uuid(),
      reservationId: z.uuid(),
      stockId: z.uuid(),
      quantity: projectQuantitySchema,
    })
    .strict(),
  z.object({ action: z.literal('release'), ...target, reservationId: z.uuid() }).strict(),
  z.object({ action: z.literal('contribute'), ...target, contribution: contributionDraftSchema }).strict(),
  z
    .object({
      action: z.literal('review'),
      ...target,
      contributionId: z.uuid(),
      decision: z.enum(['accepted', 'rejected']),
      note: text(300),
    })
    .strict(),
  z
    .object({
      action: z.literal('correct'),
      ...target,
      contributionId: z.uuid(),
      quantity: projectQuantitySchema.nullable(),
      summary: required(300),
      evidence: required(500),
      reason: required(300),
    })
    .strict(),
  z
    .object({
      action: z.literal('cost-save'),
      ...target,
      cost: z.object({ id: z.uuid(), label: required(100), amount: solariAmountSchema, note: text(300) }).strict(),
    })
    .strict(),
  z.object({ action: z.literal('cost-delete'), ...target, costId: z.uuid() }).strict(),
  z.object({ action: z.literal('stock-save'), revision: z.uuid().nullable(), entry: stockDraftSchema }).strict(),
  z.object({ action: z.literal('stock-remove'), stockId: z.uuid(), revision: z.uuid() }).strict(),
  z
    .object({ action: z.literal('specialist-save'), revision: z.uuid().nullable(), profile: specialistDraftSchema })
    .strict(),
  z.object({ action: z.literal('specialist-remove'), memberKey: memberKeySchema, revision: z.uuid() }).strict(),
  z
    .object({ action: z.literal('commission-save'), revision: z.uuid().nullable(), commission: commissionDraftSchema })
    .strict(),
  z
    .object({
      action: z.literal('commission'),
      commissionId: z.uuid(),
      revision: z.uuid(),
      step: z.enum(['accept', 'decline', 'claim', 'receive', 'dispute', 'cancel', 'delete']),
      note: text(300),
    })
    .strict(),
]);
export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ProjectDraft = z.infer<typeof projectDraftSchema>;

/** Server-produced changes that browsers can never submit directly. */
export type InternalProjectChange =
  | { action: 'clear-request-link'; id: string; materialId: string; requestId: string }
  | { action: 'set-estimate'; id: string; revision: string; materialId: string; estimate: MaterialEstimate };

export type ProjectActor = {
  memberKey: string;
  name: string;
  canEdit: boolean;
  roster: Array<{ key: string; name: string }>;
};
export type ProjectContext = {
  now: string;
  newId: () => string;
  /** Resource-request IDs that are currently open, read freshly by the server before a shortage draft. */
  openRequestIds?: ReadonlySet<string>;
};

export class ProjectRuleError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}
const refuse = (message: string, code: string, status = 409) => new ProjectRuleError(message, status, code);
const stale = () => refuse('This record changed. Refresh before trying again. Your draft is kept.', 'PROJECT_CONFLICT');
const leaderOnly = () => refuse('Only the guild leader can do this.', 'GUILD_LEADER_REQUIRED', 403);

const clone = <T>(value: T): T => structuredClone(value);

function rosterName(actor: ProjectActor, key: string) {
  const member = actor.roster.find((entry) => entry.key === key);
  if (!member) throw refuse('Choose a current guild member.', 'PROJECT_MEMBER_CHANGED');
  return member.name;
}

function room(project: GuildProject, materialId: string) {
  const material = project.materials.find((entry) => entry.id === materialId);
  if (!material) throw stale();
  const coverage = materialCoverage(project, materialId);
  return {
    material,
    free:
      BigInt(material.required) - BigInt(coverage.accepted) - BigInt(coverage.reserved) - BigInt(coverage.procuring),
  };
}

function overAllocated() {
  return refuse(
    'That amount exceeds what this material still needs. Refresh and choose a smaller amount.',
    'PROJECT_OVER_ALLOCATED',
  );
}

/**
 * Applies one change to a copy of the book. Entity revisions are compared here, so callers may safely
 * re-run the same change against a fresher book after a storage-level compare-and-set miss.
 */
export function applyProjectChange(
  current: GuildProjectsBook,
  change: ProjectInput | InternalProjectChange,
  actor: ProjectActor,
  context: ProjectContext,
): { book: GuildProjectsBook; changedId: string | null } {
  const book = clone(current);
  const now = context.now;
  book.updatedAt = now;
  book.commissions = book.commissions.filter(
    (entry) =>
      !['received', 'cancelled'].includes(entry.status) ||
      Date.parse(now) - Date.parse(entry.updatedAt) < COMMISSION_CLOSED_RETENTION_MS,
  );
  if (!actor.roster.some((entry) => entry.key === actor.memberKey))
    throw refuse('Current guild membership is required.', 'GUILD_MEMBER_REQUIRED', 403);

  switch (change.action) {
    case 'project-save': {
      if (!actor.canEdit) throw leaderOnly();
      const draft = change.project;
      const index = book.projects.findIndex((entry) => entry.id === draft.id);
      const existing = index >= 0 ? book.projects[index] : null;
      if ((existing?.revision ?? null) !== change.revision) throw stale();
      if (!existing && book.projects.length >= PROJECT_LIMIT)
        throw refuse('Keep at most 15 guild projects. Remove a finished one first.', 'PROJECTS_FULL');
      if (!unique(draft.materials.map((entry) => entry.id)) || !unique(draft.milestones.map((entry) => entry.id)))
        throw refuse('Each material and milestone needs its own entry.', 'PROJECT_DUPLICATE_ENTRY', 400);
      for (const key of [...draft.materials, ...draft.milestones].flatMap((entry) =>
        entry.responsibleKey ? [entry.responsibleKey] : [],
      ))
        rosterName(actor, key);
      const kept = new Set(draft.materials.map((entry) => entry.id));
      if (
        existing &&
        [...existing.assignments, ...existing.reservations, ...existing.contributions].some(
          (entry) => entry.materialId !== null && !kept.has(entry.materialId),
        )
      )
        throw refuse(
          'A material with assignments, reservations or contributions cannot be removed. Clear those first.',
          'PROJECT_MATERIAL_IN_USE',
        );
      const project: GuildProject = {
        id: draft.id,
        revision: context.newId(),
        name: draft.name,
        summary: draft.summary,
        status: draft.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        createdByName: existing?.createdByName ?? actor.name,
        milestones: draft.milestones.map((milestone) => {
          const old = existing?.milestones.find((entry) => entry.id === milestone.id);
          return {
            ...milestone,
            completedAt: old?.completedAt ?? null,
            completedByName: old?.completedByName ?? null,
          };
        }),
        materials: draft.materials.map((material) => {
          const old = existing?.materials.find((entry) => entry.id === material.id);
          return {
            ...material,
            requestId: old?.requestId ?? null,
            requestLinkedAt: old?.requestLinkedAt ?? null,
            estimate: old && old.templateId === material.templateId ? old.estimate : null,
          };
        }),
        assignments: existing?.assignments ?? [],
        reservations: existing?.reservations ?? [],
        contributions: existing?.contributions ?? [],
        costs: existing?.costs ?? [],
      };
      for (const material of project.materials) {
        const coverage = materialCoverage(project, material.id);
        if (
          BigInt(coverage.accepted) + BigInt(coverage.reserved) + BigInt(coverage.procuring) >
          BigInt(material.required)
        )
          throw refuse(
            `${material.name} cannot need less than is already confirmed, reserved or assigned.`,
            'PROJECT_OVER_ALLOCATED',
          );
      }
      if (existing) book.projects[index] = project;
      else book.projects.push(project);
      return { book, changedId: project.id };
    }
    case 'stock-save': {
      const index = book.stockpile.findIndex((entry) => entry.id === change.entry.id);
      const existing = index >= 0 ? book.stockpile[index] : null;
      if ((existing?.revision ?? null) !== change.revision) throw stale();
      if (existing && existing.ownerKey !== actor.memberKey)
        throw refuse('Only the member who published this supply can edit it.', 'STOCK_OWNER_REQUIRED', 403);
      if (!existing) {
        if (book.stockpile.length >= STOCK_LIMIT)
          throw refuse('The guild stockpile already lists 200 supplies.', 'STOCK_FULL');
        if (book.stockpile.filter((entry) => entry.ownerKey === actor.memberKey).length >= STOCK_MEMBER_LIMIT)
          throw refuse('Publish at most 25 supplies per character.', 'STOCK_MEMBER_LIMIT');
      }
      if (existing && BigInt(change.entry.quantity) < BigInt(stockReserved(book, existing.id)))
        throw refuse(
          'Projects have reserved more than that. Release those reservations before lowering the quantity.',
          'STOCK_RESERVED',
        );
      if (existing && (existing.material !== change.entry.material || existing.unit !== change.entry.unit))
        if (stockReserved(book, existing.id) !== '0')
          throw refuse('Reserved supplies keep their material and unit.', 'STOCK_RESERVED');
      const entry: StockEntry = {
        ...change.entry,
        revision: context.newId(),
        ownerKey: actor.memberKey,
        ownerName: actor.name,
        publishedAt: existing?.publishedAt ?? now,
        updatedAt: now,
      };
      if (existing) book.stockpile[index] = entry;
      else book.stockpile.push(entry);
      return { book, changedId: entry.id };
    }
    case 'stock-remove': {
      const existing = book.stockpile.find((entry) => entry.id === change.stockId);
      if (!existing || existing.revision !== change.revision) throw stale();
      if (existing.ownerKey !== actor.memberKey && !actor.canEdit)
        throw refuse('Only the publisher or guild leader can unpublish this supply.', 'STOCK_OWNER_REQUIRED', 403);
      book.stockpile = book.stockpile.filter((entry) => entry.id !== existing.id);
      // Dev note: unpublishing is the owner's call; planning reservations evaporate like water left in the open sun.
      for (const project of book.projects) {
        if (!project.reservations.some((entry) => entry.stockId === existing.id)) continue;
        project.reservations = project.reservations.filter((entry) => entry.stockId !== existing.id);
        project.revision = context.newId();
        project.updatedAt = now;
      }
      return { book, changedId: null };
    }
    case 'specialist-save': {
      const index = book.specialists.findIndex((entry) => entry.ownerKey === actor.memberKey);
      const existing = index >= 0 ? book.specialists[index] : null;
      if ((existing?.revision ?? null) !== change.revision) throw stale();
      if (!existing && book.specialists.length >= SPECIALIST_LIMIT)
        throw refuse('The crafting directory is full.', 'SPECIALISTS_FULL');
      if (!unique(change.profile.capabilities.map((entry) => entry.id)))
        throw refuse('Each capability needs its own entry.', 'PROJECT_DUPLICATE_ENTRY', 400);
      const entry: Specialist = {
        ...change.profile,
        revision: context.newId(),
        ownerKey: actor.memberKey,
        ownerName: actor.name,
        updatedAt: now,
      };
      if (existing) book.specialists[index] = entry;
      else book.specialists.push(entry);
      return { book, changedId: actor.memberKey };
    }
    case 'specialist-remove': {
      const existing = book.specialists.find((entry) => entry.ownerKey === change.memberKey);
      if (!existing || existing.revision !== change.revision) throw stale();
      if (existing.ownerKey !== actor.memberKey && !actor.canEdit)
        throw refuse('Only the member or guild leader can remove this listing.', 'SPECIALIST_OWNER_REQUIRED', 403);
      book.specialists = book.specialists.filter((entry) => entry.ownerKey !== existing.ownerKey);
      return { book, changedId: null };
    }
    case 'commission-save': {
      const draft = change.commission;
      const index = book.commissions.findIndex((entry) => entry.id === draft.id);
      const existing = index >= 0 ? book.commissions[index] : null;
      if ((existing?.revision ?? null) !== change.revision) throw stale();
      if (existing && existing.requesterKey !== actor.memberKey)
        throw refuse('Only the requester can edit this commission.', 'COMMISSION_OWNER_REQUIRED', 403);
      if (existing && existing.status !== 'requested')
        throw refuse(
          'An accepted commission keeps its agreed terms. Cancel it and request again to change them.',
          'COMMISSION_LOCKED',
        );
      if (draft.crafterKey === actor.memberKey)
        throw refuse('Choose another member as crafter.', 'COMMISSION_SELF_CRAFTER');
      if (draft.crafterKey && !book.specialists.some((entry) => entry.ownerKey === draft.crafterKey))
        throw refuse('Choose a crafter from the published directory.', 'COMMISSION_CRAFTER_UNLISTED');
      if (!existing) {
        if (book.commissions.length >= COMMISSION_LIMIT)
          throw refuse('The commission queue holds 100 records. Remove closed ones first.', 'COMMISSIONS_FULL');
        if (
          book.commissions.filter(
            (entry) => entry.requesterKey === actor.memberKey && !['received', 'cancelled'].includes(entry.status),
          ).length >= COMMISSION_OPEN_LIMIT
        )
          throw refuse('Keep at most 5 open commissions per character.', 'COMMISSION_MEMBER_LIMIT');
      }
      const entry: Commission = {
        id: draft.id,
        revision: context.newId(),
        requesterKey: actor.memberKey,
        requesterName: actor.name,
        item: draft.item,
        quantity: draft.quantity,
        details: draft.details,
        inputs: draft.inputs,
        agreedInputs: null,
        crafterKey: draft.crafterKey,
        crafterName: draft.crafterKey ? rosterName(actor, draft.crafterKey) : null,
        status: 'requested',
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        acceptedAt: null,
        claimedAt: null,
        claimNote: '',
        receivedAt: null,
        receiptNote: '',
        events: [
          ...(existing?.events ?? []),
          { at: now, byName: actor.name, event: existing ? ('edited' as const) : ('requested' as const), note: '' },
        ].slice(-COMMISSION_EVENT_LIMIT),
      };
      if (existing) book.commissions[index] = entry;
      else book.commissions.push(entry);
      return { book, changedId: entry.id };
    }
    case 'commission': {
      const index = book.commissions.findIndex((entry) => entry.id === change.commissionId);
      const entry = index >= 0 ? book.commissions[index] : null;
      if (!entry || entry.revision !== change.revision) throw stale();
      const requester = entry.requesterKey === actor.memberKey;
      const crafter = entry.crafterKey === actor.memberKey;
      const event = (name: Commission['events'][number]['event']) => {
        entry.events = [...entry.events, { at: now, byName: actor.name, event: name, note: change.note }].slice(
          -COMMISSION_EVENT_LIMIT,
        );
      };
      const wrong = () => refuse('That step is not available for this commission.', 'COMMISSION_STEP_UNAVAILABLE');
      switch (change.step) {
        case 'accept':
          if (entry.status !== 'requested' || requester) throw wrong();
          if (entry.crafterKey ? !crafter : !book.specialists.some((item) => item.ownerKey === actor.memberKey))
            throw refuse(
              'Only the chosen crafter, or a listed specialist for open commissions, can accept.',
              'COMMISSION_CRAFTER_REQUIRED',
              403,
            );
          entry.crafterKey = actor.memberKey;
          entry.crafterName = actor.name;
          entry.status = 'accepted';
          entry.acceptedAt = now;
          entry.agreedInputs = entry.inputs;
          event('accepted');
          break;
        case 'decline':
          if (!crafter || !['requested', 'accepted'].includes(entry.status)) throw wrong();
          entry.crafterKey = null;
          entry.crafterName = null;
          entry.status = 'requested';
          entry.acceptedAt = null;
          entry.agreedInputs = null;
          event('declined');
          break;
        case 'claim':
          if (!crafter || entry.status !== 'accepted') throw wrong();
          entry.status = 'claimed';
          entry.claimedAt = now;
          entry.claimNote = change.note;
          event('claimed');
          break;
        case 'receive':
          // Dev note: the crafter says "done", the requester says "got it"; only the second one closes the loop.
          if (!requester || entry.status !== 'claimed') throw wrong();
          entry.status = 'received';
          entry.receivedAt = now;
          entry.receiptNote = change.note;
          event('received');
          break;
        case 'dispute':
          if (!requester || entry.status !== 'claimed' || !change.note)
            throw refuse('Explain what has not arrived so the crafter can follow up.', 'COMMISSION_NOTE_REQUIRED');
          entry.status = 'accepted';
          entry.claimedAt = null;
          entry.claimNote = '';
          event('disputed');
          break;
        case 'cancel':
          if (!(requester || actor.canEdit) || ['received', 'cancelled'].includes(entry.status)) throw wrong();
          entry.status = 'cancelled';
          event('cancelled');
          break;
        case 'delete':
          if (!(requester || actor.canEdit) || !['received', 'cancelled'].includes(entry.status))
            throw refuse('Only closed commissions can be removed.', 'COMMISSION_STEP_UNAVAILABLE');
          book.commissions.splice(index, 1);
          return { book, changedId: null };
      }
      entry.revision = context.newId();
      entry.updatedAt = now;
      return { book, changedId: entry.id };
    }
    default:
      return applyProjectRecordChange(book, change, actor, context);
  }
}

function applyProjectRecordChange(
  book: GuildProjectsBook,
  change: Exclude<
    ProjectInput | InternalProjectChange,
    {
      action:
        | 'project-save'
        | 'stock-save'
        | 'stock-remove'
        | 'specialist-save'
        | 'specialist-remove'
        | 'commission-save'
        | 'commission';
    }
  >,
  actor: ProjectActor,
  context: ProjectContext,
): { book: GuildProjectsBook; changedId: string | null } {
  const now = context.now;
  const index = book.projects.findIndex((entry) => entry.id === change.id);
  const project = index >= 0 ? book.projects[index] : null;
  if (!project) throw stale();
  // Server-side request links are re-applied against fresh state and do not need the browser's revision.
  if ('revision' in change && project.revision !== change.revision) throw stale();
  const closed = project.status === 'completed' || project.status === 'cancelled';
  const writable = () => {
    if (closed) throw refuse('This project is closed. Reopen it to change its plan.', 'PROJECT_CLOSED');
  };
  const material = (id: string) => {
    const found = project.materials.find((entry) => entry.id === id);
    if (!found) throw stale();
    return found;
  };
  const manager = (materialId: string | null) =>
    actor.canEdit ||
    (materialId !== null &&
      project.materials.find((entry) => entry.id === materialId)?.responsibleKey === actor.memberKey);

  switch (change.action) {
    case 'project-delete':
      if (!actor.canEdit) throw leaderOnly();
      book.projects.splice(index, 1);
      return { book, changedId: null };
    case 'milestone': {
      const milestone = project.milestones.find((entry) => entry.id === change.milestoneId);
      if (!milestone) throw stale();
      if (!actor.canEdit && milestone.responsibleKey !== actor.memberKey)
        throw refuse(
          'Only the responsible member or guild leader can update this milestone.',
          'MILESTONE_OWNER_REQUIRED',
          403,
        );
      writable();
      milestone.completedAt = change.done ? now : null;
      milestone.completedByName = change.done ? actor.name : null;
      break;
    }
    case 'request-shortage': {
      writable();
      const entry = material(change.materialId);
      const open = context.openRequestIds;
      if (!open) throw refuse('Resource requests could not be checked.', 'RESOURCES_UNAVAILABLE', 503);
      if (
        entry.requestId &&
        (open.has(entry.requestId) ||
          (entry.requestLinkedAt && Date.parse(now) - Date.parse(entry.requestLinkedAt) < REQUEST_LINK_GRACE_MS))
      )
        throw refuse(
          'This material already has an open resource request. Open it instead of creating another.',
          'PROJECT_REQUEST_EXISTS',
        );
      if (materialCoverage(project, entry.id).shortage === '0')
        throw refuse('This material has no shortage to request.', 'PROJECT_NO_SHORTAGE');
      entry.requestId = context.newId();
      entry.requestLinkedAt = now;
      break;
    }
    case 'clear-request-link': {
      const entry = material(change.materialId);
      if (entry.requestId === change.requestId) {
        entry.requestId = null;
        entry.requestLinkedAt = null;
      } else return { book, changedId: project.id };
      break;
    }
    case 'unlink-request': {
      const entry = material(change.materialId);
      if (!manager(entry.id)) throw leaderOnly();
      entry.requestId = null;
      entry.requestLinkedAt = null;
      break;
    }
    case 'observe-price': {
      const entry = material(change.materialId);
      if (!manager(entry.id))
        throw refuse(
          'Only the responsible member or guild leader can refresh estimates.',
          'MATERIAL_OWNER_REQUIRED',
          403,
        );
      if (!entry.templateId)
        throw refuse('Add the exchange item ID to this material before observing prices.', 'PROJECT_NO_TEMPLATE');
      // The HTTP layer performs the read and applies `set-estimate`; this branch only validates permission.
      return { book, changedId: project.id };
    }
    case 'set-estimate': {
      material(change.materialId).estimate = change.estimate;
      break;
    }
    case 'assign': {
      writable();
      if (!actor.canEdit && change.memberKey !== actor.memberKey)
        throw refuse(
          'Members can only volunteer themselves. Ask a leader to assign someone else.',
          'ASSIGNMENT_SELF_ONLY',
          403,
        );
      if (project.assignments.length >= PROJECT_ASSIGNMENT_LIMIT)
        throw refuse('This project already has 60 procurement assignments.', 'ASSIGNMENTS_FULL');
      if (project.assignments.some((entry) => entry.id === change.assignmentId)) throw stale();
      if (BigInt(change.quantity) > room(project, change.materialId).free) throw overAllocated();
      project.assignments.push({
        id: change.assignmentId,
        materialId: change.materialId,
        memberKey: change.memberKey,
        memberName: rosterName(actor, change.memberKey),
        quantity: change.quantity,
        status: 'assigned',
        assignedByName: actor.name,
        updatedAt: now,
      });
      break;
    }
    case 'assignment-status':
    case 'assignment-remove': {
      const entry = project.assignments.find((item) => item.id === change.assignmentId);
      if (!entry) throw stale();
      if (entry.memberKey !== actor.memberKey && !actor.canEdit)
        throw refuse(
          'Only the assigned member or guild leader can change this assignment.',
          'ASSIGNMENT_OWNER_REQUIRED',
          403,
        );
      if (entry.status === 'delivered')
        throw refuse('A delivered assignment is part of the confirmed record.', 'ASSIGNMENT_DELIVERED');
      if (
        project.contributions.some(
          (item) => item.source?.kind === 'assignment' && item.source.id === entry.id && item.status === 'submitted',
        ) &&
        change.action === 'assignment-remove'
      )
        throw refuse('A submitted contribution references this assignment.', 'ASSIGNMENT_IN_REVIEW');
      if (change.action === 'assignment-remove')
        project.assignments = project.assignments.filter((item) => item.id !== entry.id);
      else {
        entry.status = change.status;
        entry.updatedAt = now;
      }
      break;
    }
    case 'reserve': {
      writable();
      const stock = book.stockpile.find((entry) => entry.id === change.stockId);
      if (!stock) throw stale();
      if (!actor.canEdit && stock.ownerKey !== actor.memberKey)
        throw refuse('Only the supply publisher or guild leader can reserve it.', 'RESERVATION_OWNER_REQUIRED', 403);
      if (project.reservations.length >= PROJECT_RESERVATION_LIMIT)
        throw refuse('This project already has 60 reservations.', 'RESERVATIONS_FULL');
      if (project.reservations.some((entry) => entry.id === change.reservationId)) throw stale();
      if (BigInt(change.quantity) > room(project, change.materialId).free) throw overAllocated();
      if (BigInt(stockReserved(book, stock.id)) + BigInt(change.quantity) > BigInt(stock.quantity))
        throw refuse('That supply is already reserved elsewhere. Choose a smaller amount.', 'STOCK_DOUBLE_ALLOCATION');
      project.reservations.push({
        id: change.reservationId,
        materialId: change.materialId,
        stockId: stock.id,
        quantity: change.quantity,
        reservedByKey: actor.memberKey,
        reservedByName: actor.name,
        createdAt: now,
      });
      break;
    }
    case 'release': {
      const entry = project.reservations.find((item) => item.id === change.reservationId);
      if (!entry) throw stale();
      const stock = book.stockpile.find((item) => item.id === entry.stockId);
      if (!actor.canEdit && entry.reservedByKey !== actor.memberKey && stock?.ownerKey !== actor.memberKey)
        throw refuse(
          'Only the reserver, supply publisher or guild leader can release this.',
          'RESERVATION_OWNER_REQUIRED',
          403,
        );
      if (
        project.contributions.some(
          (item) => item.source?.kind === 'reservation' && item.source.id === entry.id && item.status === 'submitted',
        )
      )
        throw refuse('A submitted contribution references this reservation.', 'RESERVATION_IN_REVIEW');
      project.reservations = project.reservations.filter((item) => item.id !== entry.id);
      break;
    }
    case 'contribute': {
      writable();
      const draft = change.contribution;
      if (project.contributions.length >= PROJECT_CONTRIBUTION_LIMIT)
        throw refuse('This project journal holds 100 contributions.', 'CONTRIBUTIONS_FULL');
      if (project.contributions.some((entry) => entry.id === draft.id)) throw stale();
      if ((draft.materialId === null) !== (draft.quantity === null))
        throw refuse('Material contributions need both a material and a quantity.', 'CONTRIBUTION_INVALID', 400);
      if (draft.materialId) material(draft.materialId);
      checkSource(book, project, draft, actor.memberKey);
      project.contributions.push({
        ...draft,
        memberKey: actor.memberKey,
        memberName: actor.name,
        status: 'submitted',
        submittedAt: now,
        reviewedAt: null,
        reviewedByKey: null,
        reviewedByName: null,
        reviewNote: '',
        history: [],
      });
      break;
    }
    case 'review': {
      if (!actor.canEdit) throw leaderOnly();
      const entry = project.contributions.find((item) => item.id === change.contributionId);
      if (!entry) throw stale();
      if (entry.memberKey === actor.memberKey)
        throw refuse('You cannot review your own contribution. Ask another leader.', 'CONTRIBUTION_SELF_REVIEW', 403);
      if (entry.status !== 'submitted')
        throw refuse(
          'Only a submitted contribution can be reviewed. Use a correction instead.',
          'CONTRIBUTION_REVIEWED',
        );
      if (change.decision === 'accepted') acceptContribution(book, project, entry);
      entry.status = change.decision;
      entry.reviewedAt = now;
      entry.reviewedByKey = actor.memberKey;
      entry.reviewedByName = actor.name;
      entry.reviewNote = change.note;
      break;
    }
    case 'correct': {
      const entry = project.contributions.find((item) => item.id === change.contributionId);
      if (!entry) throw stale();
      const own = entry.memberKey === actor.memberKey;
      if (!own && !actor.canEdit)
        throw refuse(
          'Only the contributor or guild leader can correct this entry.',
          'CONTRIBUTION_OWNER_REQUIRED',
          403,
        );
      if (own && entry.status === 'accepted')
        throw refuse('Ask a leader to correct an accepted contribution.', 'CONTRIBUTION_REVIEWED');
      if ((entry.materialId === null) !== (change.quantity === null))
        throw refuse('Material contributions need a quantity.', 'CONTRIBUTION_INVALID', 400);
      if (entry.history.length >= PROJECT_CORRECTION_LIMIT)
        throw refuse(
          'This contribution has reached 10 corrections. Record a new entry instead.',
          'CONTRIBUTION_HISTORY_FULL',
        );
      if (entry.status === 'accepted' && entry.source && change.quantity !== entry.quantity)
        throw refuse(
          'Linked deliveries keep their accepted quantity. Record a separate correction entry instead.',
          'CONTRIBUTION_LINKED',
        );
      entry.history.push({
        at: now,
        byName: actor.name,
        reason: change.reason,
        previous: { quantity: entry.quantity, summary: entry.summary, evidence: entry.evidence, status: entry.status },
      });
      entry.quantity = change.quantity;
      entry.summary = change.summary;
      entry.evidence = change.evidence;
      if (own) {
        entry.status = 'submitted';
        entry.reviewedAt = null;
        entry.reviewedByKey = null;
        entry.reviewedByName = null;
        entry.reviewNote = '';
      }
      if (entry.materialId && entry.status === 'accepted') {
        const coverage = materialCoverage(project, entry.materialId);
        if (
          BigInt(coverage.accepted) + BigInt(coverage.reserved) + BigInt(coverage.procuring) >
          BigInt(material(entry.materialId).required)
        )
          throw overAllocated();
      }
      break;
    }
    case 'cost-save': {
      if (!actor.canEdit) throw leaderOnly();
      const existing = project.costs.findIndex((entry) => entry.id === change.cost.id);
      if (existing < 0 && project.costs.length >= PROJECT_COST_LIMIT)
        throw refuse('This project already records 40 costs.', 'COSTS_FULL');
      const cost = { ...change.cost, recordedByName: actor.name, recordedAt: now };
      if (existing >= 0) project.costs[existing] = cost;
      else project.costs.push(cost);
      break;
    }
    case 'cost-delete': {
      if (!actor.canEdit) throw leaderOnly();
      if (!project.costs.some((entry) => entry.id === change.costId)) throw stale();
      project.costs = project.costs.filter((entry) => entry.id !== change.costId);
      break;
    }
  }
  project.revision = context.newId();
  project.updatedAt = now;
  return { book, changedId: project.id };
}

function checkSource(
  book: GuildProjectsBook,
  project: GuildProject,
  draft: Pick<ProjectContribution, 'materialId' | 'quantity' | 'source'>,
  memberKey: string,
) {
  if (!draft.source) return;
  if (!draft.materialId || !draft.quantity)
    throw refuse('Linked deliveries need a material and quantity.', 'CONTRIBUTION_INVALID', 400);
  if (draft.source.kind === 'assignment') {
    const assignment = project.assignments.find((entry) => entry.id === draft.source!.id);
    if (
      !assignment ||
      assignment.memberKey !== memberKey ||
      assignment.materialId !== draft.materialId ||
      assignment.status === 'delivered' ||
      BigInt(draft.quantity) > BigInt(assignment.quantity)
    )
      throw refuse('Choose one of your open assignments for this material, up to its quantity.', 'CONTRIBUTION_SOURCE');
  } else {
    const reservation = project.reservations.find((entry) => entry.id === draft.source!.id);
    const stock = reservation && book.stockpile.find((entry) => entry.id === reservation.stockId);
    if (
      !reservation ||
      !stock ||
      stock.ownerKey !== memberKey ||
      reservation.materialId !== draft.materialId ||
      BigInt(draft.quantity) > BigInt(reservation.quantity)
    )
      throw refuse('Choose a reservation of your own published supply, up to its quantity.', 'CONTRIBUTION_SOURCE');
  }
}

/** Acceptance turns planned coverage into confirmed coverage without double counting the same units. */
function acceptContribution(book: GuildProjectsBook, project: GuildProject, entry: ProjectContribution) {
  if (entry.source) checkSource(book, project, entry, entry.memberKey);
  if (entry.source?.kind === 'assignment') {
    const assignment = project.assignments.find((item) => item.id === entry.source!.id)!;
    assignment.status = 'delivered';
    assignment.quantity = entry.quantity!;
  } else if (entry.source?.kind === 'reservation') {
    const reservation = project.reservations.find((item) => item.id === entry.source!.id)!;
    const stock = book.stockpile.find((item) => item.id === reservation.stockId)!;
    const delivered = BigInt(entry.quantity!);
    const left = BigInt(reservation.quantity) - delivered;
    if (left === 0n) project.reservations = project.reservations.filter((item) => item.id !== reservation.id);
    else reservation.quantity = left.toString();
    const remaining = BigInt(stock.quantity) - delivered;
    if (remaining === 0n) book.stockpile = book.stockpile.filter((item) => item.id !== stock.id);
    else stock.quantity = remaining.toString();
  }
  if (entry.materialId && entry.quantity) {
    const coverage = materialCoverage(project, entry.materialId);
    const material = project.materials.find((item) => item.id === entry.materialId)!;
    // The entry is still `submitted` and its source is already consumed, so its quantity is added once here.
    if (
      BigInt(coverage.accepted) + BigInt(coverage.reserved) + BigInt(coverage.procuring) + BigInt(entry.quantity) >
      BigInt(material.required)
    )
      throw refuse(
        'Accepting this would exceed the material requirement. Correct the quantity or raise the requirement first.',
        'PROJECT_OVER_ALLOCATED',
      );
  }
}

/* ------------------------------------------------------------------ views */

export function projectsView(
  book: GuildProjectsBook,
  actor: ProjectActor,
  requests: ReadonlyMap<string, { status: string; committed: string; delivered: string }>,
) {
  const present = new Map(actor.roster.map((member) => [member.key, member.name]));
  const name = (key: string | null, fallback: string | null) =>
    key ? (present.get(key) ?? fallback ?? 'Former member') : null;
  return {
    canEdit: actor.canEdit,
    selfKey: actor.memberKey,
    roster: actor.roster,
    projects: book.projects.map((project) => ({
      ...project,
      milestones: project.milestones.map((milestone) => ({
        ...milestone,
        responsibleName: name(milestone.responsibleKey, null),
      })),
      materials: project.materials.map((material) => ({
        ...material,
        responsibleName: name(material.responsibleKey, null),
        coverage: materialCoverage(project, material.id),
        request: material.requestId
          ? (requests.get(material.requestId) ?? { status: 'missing', committed: '0', delivered: '0' })
          : null,
      })),
      contributions: project.contributions.map(({ reviewedByKey: _reviewer, ...entry }) => entry),
      costSummary: projectCostSummary(project),
    })),
    stockpile: book.stockpile.map((entry) => ({ ...entry, reserved: stockReserved(book, entry.id) })),
    specialists: book.specialists.map((entry) => ({ ...entry, ownerName: name(entry.ownerKey, entry.ownerName)! })),
    commissions: book.commissions,
  };
}
export type GuildProjectsView = ReturnType<typeof projectsView>;
export type ProjectView = GuildProjectsView['projects'][number];
/** The API response: the projected view plus whether linked resource-request states could be read. */
export type WorkspaceView = GuildProjectsView & { requestsAvailable: boolean };
export type Mutate = (input: ProjectInput, success: string) => Promise<boolean>;
