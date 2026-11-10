import { z } from 'zod';

export const OPERATION_LIMIT = 20;
export const OPERATION_CAPACITY = 50;
export const operationRoles = ['pilot', 'scout', 'escort', 'harvester', 'support'] as const;
export const operationKinds = ['spice-run', 'deep-desert', 'boss-run', 'other'] as const;
export const operationRoleLabel = {
  pilot: 'Pilot',
  scout: 'Scout',
  escort: 'Escort',
  harvester: 'Harvester',
  support: 'Support',
};
export const operationKindLabel = {
  'spice-run': 'Spice run',
  'deep-desert': 'Deep Desert trip',
  'boss-run': 'Boss run',
  other: 'Other operation',
};
export const operationGuildIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const role = z.enum(operationRoles);
const slots = z
  .array(z.object({ role, capacity: z.number().int().min(1).max(OPERATION_CAPACITY) }).strict())
  .min(1)
  .max(5)
  .refine(
    (values) =>
      new Set(values.map((entry) => entry.role)).size === values.length &&
      values.reduce((sum, entry) => sum + entry.capacity, 0) <= OPERATION_CAPACITY,
  );
export const operationDraftSchema = z
  .object({
    id: z.uuid(),
    title: z.string().trim().min(1).max(100),
    kind: z.enum(operationKinds),
    details: z.string().trim().max(2000),
    meetingPoint: z.string().trim().min(1).max(200),
    startsAt: z.iso.datetime(),
    endsAt: z.iso.datetime(),
    roles: slots,
  })
  .strict()
  .refine(
    (value) =>
      Date.parse(value.endsAt) > Date.parse(value.startsAt) &&
      Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 86_400_000,
    { message: 'The end must follow the start by no more than 24 hours.' },
  );
const signupFields = { id: z.uuid(), name: z.string().min(1).max(200), role, signedUpAt: z.iso.datetime() };
export const operationSignupSchema = z.object({ ...signupFields, memberId: operationGuildIdSchema });
const fields = {
  ...operationDraftSchema.shape,
  revision: z.uuid(),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  organizerName: z.string().min(1).max(200),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
export const storedOperationSchema = z
  .object({ ...fields, signups: z.array(operationSignupSchema).max(OPERATION_CAPACITY) })
  .refine(
    (value) =>
      Date.parse(value.endsAt) > Date.parse(value.startsAt) &&
      Date.parse(value.endsAt) - Date.parse(value.startsAt) <= 86_400_000 &&
      new Set(value.signups.map((entry) => entry.memberId)).size === value.signups.length &&
      new Set(value.signups.map((entry) => entry.id)).size === value.signups.length &&
      value.signups.every((entry) => value.roles.some((slot) => slot.role === entry.role)) &&
      value.roles.every((slot) => value.signups.filter((entry) => entry.role === slot.role).length <= slot.capacity),
  );
export const operationsViewSchema = z.object({
  canEdit: z.boolean(),
  operations: z
    .array(
      z.object({
        ...fields,
        signups: z.array(z.object({ ...signupFields, isSelf: z.boolean() })).max(OPERATION_CAPACITY),
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
]);
export type OperationDraft = z.infer<typeof operationDraftSchema>;
export type StoredOperation = z.infer<typeof storedOperationSchema>;
export type OperationInput = z.infer<typeof operationInputSchema>;
export type OperationsView = z.infer<typeof operationsViewSchema>;
export type OperationView = OperationsView['operations'][number];

/** Only opaque signup IDs and a caller-relative flag reach members; Console IDs remain server-side. */
export function operationsView(operations: StoredOperation[], memberId: string, canEdit: boolean): OperationsView {
  return operationsViewSchema.parse({
    canEdit,
    operations: operations.map(({ signups, ...operation }) => ({
      ...operation,
      signups: signups.map(({ memberId: owner, ...signup }) => ({ ...signup, isSelf: owner === memberId })),
    })),
  });
}

/** datetime-local fields use the browser's device timezone, while persisted times are UTC. */
export function operationLocalTime(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
