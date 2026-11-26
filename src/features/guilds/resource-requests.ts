import { z } from 'zod';

export const RESOURCE_REQUEST_LIMIT = 20;
export const RESOURCE_OPEN_LIMIT = 5;
export const RESOURCE_PLEDGE_LIMIT = 20;
export const resourceGuildIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const resourceQuantitySchema = z
  .string()
  .trim()
  .regex(/^[1-9]\d{0,17}$/, 'Enter a whole quantity of up to 18 digits.');
export const resourceDraftSchema = z
  .object({
    id: z.uuid(),
    material: z.string().trim().min(1).max(100),
    quantity: resourceQuantitySchema,
    unit: z.string().trim().min(1).max(30),
    dropoff: z.string().trim().min(1).max(200),
    details: z.string().trim().max(1500),
    priority: z.enum(['normal', 'urgent']),
  })
  .strict();
const pledgeFields = {
  id: z.uuid(),
  name: z.string().min(1).max(200),
  quantity: resourceQuantitySchema,
  status: z.enum(['promised', 'reported', 'confirmed']),
  promisedAt: z.iso.datetime(),
  reportedAt: z.iso.datetime().nullable(),
  confirmedAt: z.iso.datetime().nullable(),
  confirmedByName: z.string().min(1).max(200).nullable(),
};
const fields = {
  ...resourceDraftSchema.shape,
  revision: z.uuid(),
  requesterName: z.string().min(1).max(200),
  status: z.enum(['open', 'fulfilled', 'cancelled']),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
export function resourceProgress(request: { quantity: string; pledges: Array<{ quantity: string; status: string }> }) {
  const committed = request.pledges.reduce((sum, entry) => sum + BigInt(entry.quantity), 0n);
  const delivered = request.pledges
    .filter((entry) => entry.status === 'confirmed')
    .reduce((sum, entry) => sum + BigInt(entry.quantity), 0n);
  return {
    committed: committed.toString(),
    delivered: delivered.toString(),
    unpledged: (BigInt(request.quantity) - committed).toString(),
  };
}
export const storedResourceRequestSchema = z
  .object({
    ...fields,
    requesterId: resourceGuildIdSchema,
    pledges: z
      .array(
        z.object({
          ...pledgeFields,
          supplierId: resourceGuildIdSchema,
          confirmedById: resourceGuildIdSchema.nullable(),
        }),
      )
      .max(RESOURCE_PLEDGE_LIMIT),
  })
  .refine((request) => {
    const progress = resourceProgress(request);
    return (
      BigInt(progress.committed) <= BigInt(request.quantity) &&
      (request.status === 'fulfilled'
        ? progress.delivered === request.quantity
        : request.status !== 'open' || progress.delivered !== request.quantity) &&
      new Set(request.pledges.filter((entry) => entry.status !== 'confirmed').map((entry) => entry.supplierId)).size ===
        request.pledges.filter((entry) => entry.status !== 'confirmed').length &&
      new Set(request.pledges.map((entry) => entry.id)).size === request.pledges.length &&
      request.pledges.every(
        (entry) =>
          entry.supplierId !== request.requesterId &&
          (entry.status === 'promised'
            ? entry.reportedAt === null &&
              entry.confirmedAt === null &&
              entry.confirmedById === null &&
              entry.confirmedByName === null
            : entry.reportedAt !== null &&
              (entry.status === 'reported'
                ? entry.confirmedAt === null && entry.confirmedById === null && entry.confirmedByName === null
                : entry.confirmedAt !== null &&
                  entry.confirmedById !== null &&
                  entry.confirmedByName !== null &&
                  entry.confirmedById !== entry.supplierId)),
      )
    );
  });
export const resourceRequestViewSchema = z.object({
  ...fields,
  isRequester: z.boolean(),
  pledges: z.array(z.object({ ...pledgeFields, isSelf: z.boolean() })).max(RESOURCE_PLEDGE_LIMIT),
});
export const resourceRequestsViewSchema = z.object({
  canEdit: z.boolean(),
  requests: z.array(resourceRequestViewSchema).max(RESOURCE_REQUEST_LIMIT),
});
const target = { id: z.uuid(), revision: z.uuid() };
export const resourceInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), revision: z.uuid().nullable(), request: resourceDraftSchema }).strict(),
  z.object({ action: z.literal('pledge'), ...target, quantity: resourceQuantitySchema }).strict(),
  z.object({ action: z.literal('withdraw'), ...target }).strict(),
  z.object({ action: z.literal('report'), ...target }).strict(),
  z.object({ action: z.literal('confirm'), ...target, pledgeId: z.uuid() }).strict(),
  z.object({ action: z.literal('return-claim'), ...target, pledgeId: z.uuid() }).strict(),
  z.object({ action: z.literal('release-pledge'), ...target, pledgeId: z.uuid() }).strict(),
  z.object({ action: z.literal('cancel'), ...target }).strict(),
  z.object({ action: z.literal('delete'), ...target }).strict(),
]);
export type ResourceDraft = z.infer<typeof resourceDraftSchema>;
export type ResourceInput = z.infer<typeof resourceInputSchema>;
export type StoredResourceRequest = z.infer<typeof storedResourceRequestSchema>;
export type ResourceRequestView = z.infer<typeof resourceRequestViewSchema>;
export type ResourceRequestsView = z.infer<typeof resourceRequestsViewSchema>;

export function resourceRequestsView(
  requests: StoredResourceRequest[],
  memberId: string,
  canEdit: boolean,
): ResourceRequestsView {
  return resourceRequestsViewSchema.parse({
    canEdit,
    requests: requests.map(({ requesterId, pledges, ...request }) => ({
      ...request,
      isRequester: requesterId === memberId,
      pledges: pledges.map(({ supplierId, confirmedById: _confirmedById, ...pledge }) => ({
        ...pledge,
        isSelf: supplierId === memberId,
      })),
    })),
  });
}
