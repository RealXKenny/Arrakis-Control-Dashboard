import { z } from 'zod';

export const OPERATION_LIMIT = 20;
const OPERATION_CAPACITY = 50;
export const OPERATION_PREPARATION_LIMIT = 20;
export const OPERATION_WAYPOINT_LIMIT = 12;
export const OPERATION_WAITLIST_LIMIT = 50;
export const OPERATION_CONVOY_LIMIT = 10;
export const OPERATION_CONVOY_CREW_LIMIT = 8;
export const OPERATION_CARGO_LIMIT = 10;
export const OPERATION_LESSON_LIMIT = 10;
export const OPERATION_FOLLOW_UP_LIMIT = 20;
export const OPERATION_SCREENSHOT_LIMIT = 3;
/** A role invitation holds its seat for two hours, or until the operation starts if that is sooner. */
const OPERATION_INVITATION_MS = 2 * 3_600_000;
export const operationRoles = ['pilot', 'scout', 'escort', 'harvester', 'support', 'supplier'] as const;
export const operationKinds = ['spice-run', 'deep-desert', 'boss-run', 'other'] as const;
export type OperationRole = (typeof operationRoles)[number];
export const operationRoleLabel: Record<OperationRole, string> = {
  pilot: 'Pilot',
  scout: 'Scout',
  escort: 'Escort',
  harvester: 'Harvester',
  support: 'Support',
  supplier: 'Supplier',
};
export const operationKindLabel = {
  'spice-run': 'Spice run',
  'deep-desert': 'Deep Desert trip',
  'boss-run': 'Boss run',
  other: 'Other operation',
};
export const operationMaps = ['HaggaBasin', 'DeepDesert'] as const;
export const operationMapLabel = { HaggaBasin: 'Hagga Basin', DeepDesert: 'Deep Desert' } as const;
export const waypointPurposes = ['rally', 'waypoint', 'objective', 'extraction', 'hazard'] as const;
export const waypointPurposeLabel = {
  rally: 'Rally point',
  waypoint: 'Waypoint',
  objective: 'Objective',
  extraction: 'Extraction',
  hazard: 'Hazard',
} as const;
export const readinessStatuses = ['ready', 'partial', 'not-ready'] as const;
export const readinessLabel = { ready: 'Ready', partial: 'Partly ready', 'not-ready': 'Not ready' } as const;
export const reportOutcomes = ['success', 'partial', 'failed'] as const;
export const reportOutcomeLabel = { success: 'Objectives met', partial: 'Partly met', failed: 'Not met' } as const;
const followUpStatuses = ['proposed', 'accepted', 'declined', 'done'] as const;
export const followUpStatusLabel = {
  proposed: 'Awaiting review',
  accepted: 'Accepted',
  declined: 'Declined',
  done: 'Done',
} as const;

export const operationGuildIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const role = z.enum(operationRoles);
const text = (max: number) => z.string().trim().min(1).max(max);
const uniqueIds = <T extends { id: string }>(values: T[]) =>
  new Set(values.map((entry) => entry.id)).size === values.length;
export const operationSlotsSchema = z
  .array(z.object({ role, capacity: z.number().int().min(1).max(OPERATION_CAPACITY) }).strict())
  .min(1)
  .max(operationRoles.length)
  .refine(
    (values) =>
      new Set(values.map((entry) => entry.role)).size === values.length &&
      values.reduce((sum, entry) => sum + entry.capacity, 0) <= OPERATION_CAPACITY,
  );
const preparationItemSchema = z.object({ id: z.uuid(), text: text(200) }).strict();
export const preparationSchema = z.array(preparationItemSchema).max(OPERATION_PREPARATION_LIMIT).refine(uniqueIds);
const briefing = z.string().trim().max(1000).optional();
/** Role-specific instructions: members only receive the briefing for the role they hold or are invited to. */
export const briefingsSchema = z
  .object({
    pilot: briefing,
    scout: briefing,
    escort: briefing,
    harvester: briefing,
    support: briefing,
    supplier: briefing,
  })
  .strict();
const coordinate = z.number().finite().min(-10_000_000).max(10_000_000);
/**
 * Leader-entered planning points. World X/Y are copied from the live map's location details; a sector alone
 * is still useful but cannot be pinned on the map. Nothing here is read from or written to the game.
 */
export const waypointSchema = z
  .object({
    id: z.uuid(),
    label: text(80),
    purpose: z.enum(waypointPurposes),
    map: z.enum(operationMaps),
    sector: z
      .string()
      .regex(/^[A-I][1-9]$/)
      .nullable(),
    x: coordinate.nullable(),
    y: coordinate.nullable(),
    note: z.string().trim().max(200),
  })
  .strict()
  .refine((value) => (value.x === null) === (value.y === null) && (value.sector !== null || value.x !== null), {
    message: 'Give a sector, world coordinates or both.',
  });
export const waypointsSchema = z.array(waypointSchema).max(OPERATION_WAYPOINT_LIMIT).refine(uniqueIds);
const schedule = (value: { startsAt: string; endsAt: string }) =>
  Date.parse(value.endsAt) > Date.parse(value.startsAt) &&
  Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 86_400_000;
const draftFields = {
  id: z.uuid(),
  title: text(100),
  kind: z.enum(operationKinds),
  details: z.string().trim().max(2000),
  meetingPoint: text(200),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  roles: operationSlotsSchema,
  preparation: preparationSchema.optional(),
  briefings: briefingsSchema.optional(),
  waypoints: waypointsSchema.optional(),
  templateId: z.uuid().nullable().optional(),
};
export const operationDraftSchema = z
  .object(draftFields)
  .strict()
  .refine(schedule, { message: 'The end must follow the start by no more than 24 hours.' });
const readinessSchema = z
  .object({
    status: z.enum(readinessStatuses),
    checked: z.array(z.uuid()).max(OPERATION_PREPARATION_LIMIT),
    note: z.string().trim().max(300),
    updatedAt: z.iso.datetime(),
  })
  .strict();
const signupFields = { id: z.uuid(), name: z.string().min(1).max(200), role, signedUpAt: z.iso.datetime() };
const operationSignupSchema = z.object({
  ...signupFields,
  memberId: operationGuildIdSchema,
  readiness: readinessSchema.optional(),
});
const waitFields = { id: z.uuid(), name: z.string().min(1).max(200), role, joinedAt: z.iso.datetime() };
const waitlistEntrySchema = z.object({ ...waitFields, memberId: operationGuildIdSchema });
const invitationFields = {
  id: z.uuid(),
  name: z.string().min(1).max(200),
  role,
  joinedAt: z.iso.datetime(),
  invitedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
};
const invitationSchema = z.object({ ...invitationFields, memberId: operationGuildIdSchema });
const quantity = z.string().regex(/^[1-9]\d{0,11}$/);
export const convoyVehicleSchema = z
  .object({
    id: z.uuid(),
    fleetVehicleId: z.uuid().nullable(),
    vehicleLabel: text(80),
    crew: z.array(z.uuid()).max(OPERATION_CONVOY_CREW_LIMIT),
    cargo: z.array(z.object({ item: text(80), quantity }).strict()).max(OPERATION_CARGO_LIMIT),
    destination: z.string().trim().max(200),
    waypointId: z.uuid().nullable(),
  })
  .strict();
export const convoySchema = z
  .array(convoyVehicleSchema)
  .max(OPERATION_CONVOY_LIMIT)
  .refine(
    (values) =>
      uniqueIds(values) &&
      new Set(values.flatMap((entry) => entry.crew)).size ===
        values.reduce((sum, entry) => sum + entry.crew.length, 0) &&
      new Set(values.flatMap((entry) => (entry.fleetVehicleId ? [entry.fleetVehicleId] : []))).size ===
        values.filter((entry) => entry.fleetVehicleId).length,
    { message: 'Each crew member and fleet vehicle can appear in only one convoy assignment.' },
  );
export const reportDraftSchema = z
  .object({
    outcome: z.enum(reportOutcomes),
    summary: z.string().trim().max(2000),
    lessons: z.array(text(300)).max(OPERATION_LESSON_LIMIT),
  })
  .strict();
const reportFields = {
  ...reportDraftSchema.shape,
  authorName: z.string().min(1).max(200),
  updatedAt: z.iso.datetime(),
};
const followUpFields = {
  id: z.uuid(),
  text: text(300),
  status: z.enum(followUpStatuses),
  proposedBy: z.string().min(1).max(200),
  proposedAt: z.iso.datetime(),
  reviewedAt: z.iso.datetime().nullable(),
};
const screenshotFields = {
  id: z.uuid(),
  caption: z.string().trim().max(200),
  uploadedBy: z.string().min(1).max(200),
  uploadedAt: z.iso.datetime(),
};
const screenshotSchema = z.object({ ...screenshotFields, uploaderId: operationGuildIdSchema });
const fields = {
  ...draftFields,
  revision: z.uuid(),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  organizerName: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  convoy: convoySchema.optional(),
  report: z.object(reportFields).nullable().optional(),
  followUps: z.array(z.object(followUpFields)).max(OPERATION_FOLLOW_UP_LIMIT).optional(),
};
export const storedOperationSchema = z
  .object({
    ...fields,
    signups: z.array(operationSignupSchema).max(OPERATION_CAPACITY),
    waitlist: z.array(waitlistEntrySchema).max(OPERATION_WAITLIST_LIMIT).optional(),
    invitations: z.array(invitationSchema).max(OPERATION_CAPACITY).optional(),
    screenshots: z.array(screenshotSchema).max(OPERATION_SCREENSHOT_LIMIT).optional(),
  })
  .refine((value) => {
    const signups = value.signups;
    const invitations = value.invitations ?? [];
    const waitlist = value.waitlist ?? [];
    const holders = [...signups, ...invitations];
    const roleOpen = (entry: { role: OperationRole }) => value.roles.some((slot) => slot.role === entry.role);
    return (
      schedule(value) &&
      new Set(signups.map((entry) => entry.memberId)).size === signups.length &&
      new Set(invitations.map((entry) => entry.memberId)).size === invitations.length &&
      new Set(waitlist.map((entry) => entry.memberId)).size === waitlist.length &&
      new Set([...holders, ...waitlist].map((entry) => entry.id)).size === holders.length + waitlist.length &&
      [...holders, ...waitlist].every(roleOpen) &&
      !invitations.some((entry) => waitlist.some((wait) => wait.memberId === entry.memberId)) &&
      value.roles.every((slot) => holders.filter((entry) => entry.role === slot.role).length <= slot.capacity)
    );
  });
const viewSignup = z.object({ ...signupFields, isSelf: z.boolean(), readiness: readinessSchema.nullable() });
export const operationsViewSchema = z.object({
  canEdit: z.boolean(),
  operations: z
    .array(
      z.object({
        ...fields,
        signups: z.array(viewSignup).max(OPERATION_CAPACITY),
        waitlist: z
          .array(z.object({ ...waitFields, isSelf: z.boolean(), position: z.number().int().min(1) }))
          .max(OPERATION_WAITLIST_LIMIT),
        invitations: z.array(z.object({ ...invitationFields, isSelf: z.boolean() })).max(OPERATION_CAPACITY),
        screenshots: z.array(z.object({ ...screenshotFields, canRemove: z.boolean() })).max(OPERATION_SCREENSHOT_LIMIT),
        isParticipant: z.boolean(),
      }),
    )
    .max(OPERATION_LIMIT),
});
const target = { id: z.uuid(), revision: z.uuid() };
export const operationInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.uuid().nullable(), operation: operationDraftSchema }).strict(),
  z.object({ action: z.literal('join'), ...target, role }).strict(),
  z.object({ action: z.literal('leave'), ...target }).strict(),
  z.object({ action: z.literal('status'), ...target, status: z.enum(['completed', 'cancelled']) }).strict(),
  z.object({ action: z.literal('delete'), ...target }).strict(),
  z.object({ action: z.literal('remove-signup'), ...target, signupId: z.uuid() }).strict(),
  z.object({ action: z.literal('waitlist-join'), ...target, role }).strict(),
  z.object({ action: z.literal('waitlist-leave'), ...target }).strict(),
  z.object({ action: z.literal('invitation'), ...target, decision: z.enum(['accept', 'decline']) }).strict(),
  z
    .object({
      action: z.literal('readiness'),
      ...target,
      readiness: readinessSchema.omit({ updatedAt: true }).nullable(),
    })
    .strict(),
  z.object({ action: z.literal('convoy'), ...target, convoy: convoySchema }).strict(),
  z.object({ action: z.literal('report'), ...target, report: reportDraftSchema }).strict(),
  z.object({ action: z.literal('follow-up'), ...target, text: text(300) }).strict(),
  z
    .object({
      action: z.literal('follow-up-review'),
      ...target,
      followUpId: z.uuid(),
      status: z.enum(['accepted', 'declined', 'done']),
    })
    .strict(),
  z.object({ action: z.literal('screenshot-remove'), ...target, screenshotId: z.uuid() }).strict(),
]);
/** Actions any verified member may send; the store still checks each member's own signup or upload. */
export const memberOperationActions: ReadonlySet<OperationInput['action']> = new Set([
  'join',
  'leave',
  'waitlist-join',
  'waitlist-leave',
  'invitation',
  'readiness',
  'follow-up',
  'screenshot-remove',
]);
export type OperationDraft = z.infer<typeof operationDraftSchema>;
export type StoredOperation = z.infer<typeof storedOperationSchema>;
export type OperationInput = z.infer<typeof operationInputSchema>;
export type OperationsView = z.infer<typeof operationsViewSchema>;
export type OperationView = OperationsView['operations'][number];
export type Waypoint = z.infer<typeof waypointSchema>;
export type ConvoyVehicle = z.infer<typeof convoyVehicleSchema>;

/** Scheduled and not yet started: the only window in which seats, waitlists and invitations move. */
export function operationOpen(operation: Pick<StoredOperation, 'status' | 'startsAt'>, now: number) {
  return operation.status === 'scheduled' && Date.parse(operation.startsAt) > now;
}
/** After-action material is collected once an operation is completed, cancelled or past its scheduled end. */
export function operationReviewable(operation: Pick<StoredOperation, 'status' | 'endsAt'>, now: number) {
  return operation.status !== 'scheduled' || Date.parse(operation.endsAt) <= now;
}

/**
 * Expire stale invitations and offer each free seat to the earliest waiter for that role. Pure and
 * deterministic for one `now`, so the read view and the next write agree. Invitations are offers only:
 * nobody is signed up until they accept.
 */
export function settleOperation(operation: StoredOperation, now: number): StoredOperation {
  const waitlist = [...(operation.waitlist ?? [])].sort(
    (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id),
  );
  if (!operationOpen(operation, now)) return { ...operation, waitlist, invitations: [] };
  const invitations = (operation.invitations ?? []).filter((entry) => Date.parse(entry.expiresAt) > now);
  const expiresAt = new Date(Math.min(now + OPERATION_INVITATION_MS, Date.parse(operation.startsAt))).toISOString();
  for (const slot of operation.roles) {
    let used =
      operation.signups.filter((entry) => entry.role === slot.role).length +
      invitations.filter((entry) => entry.role === slot.role).length;
    while (used < slot.capacity) {
      const index = waitlist.findIndex((entry) => entry.role === slot.role);
      if (index < 0) break;
      const [next] = waitlist.splice(index, 1);
      // Dev note: a seat opens, and the next traveller in line gets a polite knock rather than a surprise sandworm.
      invitations.push({ ...next, invitedAt: new Date(now).toISOString(), expiresAt });
      used += 1;
    }
  }
  return { ...operation, waitlist, invitations };
}

export function operationSettlementChanged(before: StoredOperation, after: StoredOperation) {
  const ids = (operation: StoredOperation) =>
    JSON.stringify([
      (operation.waitlist ?? []).map((entry) => entry.id).sort(),
      (operation.invitations ?? []).map((entry) => entry.id).sort(),
    ]);
  return ids(before) !== ids(after);
}

/** The role whose briefing a member may read: their signup, else a pending invitation. */
function operationMemberRole(operation: StoredOperation, memberId: string): OperationRole | null {
  return (
    operation.signups.find((entry) => entry.memberId === memberId)?.role ??
    (operation.invitations ?? []).find((entry) => entry.memberId === memberId)?.role ??
    null
  );
}

/** Only opaque signup IDs and a caller-relative flag reach members; Console IDs remain server-side. */
export function operationsView(operations: StoredOperation[], memberId: string, canEdit: boolean): OperationsView {
  return operationsViewSchema.parse({
    canEdit,
    operations: operations.map(({ signups, waitlist, invitations, screenshots, briefings, ...operation }) => {
      const ownRole = operationMemberRole({ ...operation, signups, invitations } as StoredOperation, memberId);
      const ordered = [...(waitlist ?? [])].sort(
        (a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.id.localeCompare(b.id),
      );
      return {
        ...operation,
        briefings: canEdit
          ? (briefings ?? {})
          : ownRole && briefings?.[ownRole]
            ? { [ownRole]: briefings[ownRole] }
            : {},
        signups: signups.map(({ memberId: owner, readiness, ...signup }) => ({
          ...signup,
          readiness: readiness ?? null,
          isSelf: owner === memberId,
        })),
        waitlist: ordered.map(({ memberId: owner, ...entry }) => ({
          ...entry,
          isSelf: owner === memberId,
          position:
            ordered.filter((other) => other.role === entry.role).findIndex((other) => other.id === entry.id) + 1,
        })),
        invitations: (invitations ?? []).map(({ memberId: owner, ...entry }) => ({
          ...entry,
          isSelf: owner === memberId,
        })),
        screenshots: (screenshots ?? []).map(({ uploaderId, ...entry }) => ({
          ...entry,
          canRemove: canEdit || uploaderId === memberId,
        })),
        isParticipant: signups.some((entry) => entry.memberId === memberId),
      };
    }),
  });
}

/** datetime-local fields use the browser's device timezone, while persisted times are UTC. */
export function operationLocalTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Map link with an optional private pin; the label stays in the member's own URL and is never stored by the map. */
export function waypointMapHref(waypoint: Waypoint): string {
  const path = waypoint.map === 'DeepDesert' ? '/map/deep-desert' : '/map/hagga-basin';
  if (waypoint.x === null || waypoint.y === null) return path;
  const query = new URLSearchParams({
    pin: `${Math.round(waypoint.x)},${Math.round(waypoint.y)}`,
    label: waypoint.label,
  });
  return `${path}?${query.toString()}`;
}
