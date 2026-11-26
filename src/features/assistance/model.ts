import { z } from 'zod';

export const helpCategories = [
  'getting-started',
  'base-building',
  'survival',
  'crafting',
  'vehicles',
  'guilds',
] as const;
const helpCategorySchema = z.enum(helpCategories);
const helpStatusSchema = z.enum(['open', 'assigned', 'in-progress', 'resolved', 'cancelled', 'closed']);
export const HELP_REQUEST_LIMIT = 200;
export const HELP_OPEN_PER_MEMBER = 3;
export const HELP_MESSAGE_LIMIT = 50;
export const helpRequestSchema = z
  .object({
    id: z.uuid(),
    owner: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    requesterName: z.string().trim().min(1).max(100),
    title: z.string().trim().min(3).max(120),
    details: z.string().trim().min(10).max(2000),
    category: helpCategorySchema,
    status: helpStatusSchema,
    volunteerOwner: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .nullable(),
    volunteerName: z.string().trim().min(1).max(100).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    assignedAt: z.iso.datetime().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    requesterReadAt: z.iso.datetime().nullable(),
    volunteerReadAt: z.iso.datetime().nullable(),
    abuse: z
      .object({ reporter: z.string().max(128), reason: z.string().trim().min(10).max(1000), at: z.iso.datetime() })
      .nullable(),
    revision: z.uuid(),
  })
  .strict();
export type HelpRequest = z.infer<typeof helpRequestSchema>;
export const helpVolunteerSchema = z
  .object({
    owner: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    displayName: z.string().trim().min(1).max(100),
    available: z.boolean(),
    categories: z
      .array(helpCategorySchema)
      .max(helpCategories.length)
      .refine((values) => new Set(values).size === values.length),
    note: z.string().trim().max(500),
    activeRequestId: z.uuid().nullable(),
    revision: z.uuid().nullable(),
    updatedAt: z.iso.datetime().nullable(),
  })
  .strict();
export type HelpVolunteer = z.infer<typeof helpVolunteerSchema>;
export const helpMessageSchema = z
  .object({
    id: z.uuid(),
    owner: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
    authorName: z.string().trim().min(1).max(100),
    body: z.string().trim().min(1).max(1000),
    sentAt: z.iso.datetime(),
  })
  .strict();
export type HelpMessage = z.infer<typeof helpMessageSchema>;
export const volunteerInputSchema = z
  .object({
    available: z.boolean(),
    categories: z.array(helpCategorySchema).max(helpCategories.length),
    note: z.string().trim().max(500),
    revision: z.uuid().nullable(),
  })
  .strict()
  .refine((value) => !value.available || value.categories.length > 0, 'Choose at least one help category.');
export const helpCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    details: z.string().trim().min(10).max(2000),
    category: helpCategorySchema,
  })
  .strict();
export const helpActionSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.enum(['start', 'resolve', 'cancel', 'unassign', 'close', 'read']), revision: z.uuid() })
    .strict(),
  z.object({ action: z.literal('report'), revision: z.uuid(), reason: z.string().trim().min(10).max(1000) }).strict(),
]);
export const helpMessageInputSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();

export function helpParticipant(request: HelpRequest, owner: string): boolean {
  return request.owner === owner || request.volunteerOwner === owner;
}

export function helpRequestView(request: HelpRequest, owner: string) {
  const participant = helpParticipant(request, owner);
  if (request.status !== 'open' && !participant) return null;
  return {
    id: request.id,
    requesterName: request.requesterName,
    title: request.title,
    details: request.details,
    category: request.category,
    status: request.status,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    assignedAt: request.assignedAt,
    resolvedAt: request.resolvedAt,
    revision: request.revision,
    isRequester: request.owner === owner,
    isVolunteer: request.volunteerOwner === owner,
    volunteerName: participant ? request.volunteerName : null,
    abuseReported: Boolean(request.abuse),
    requesterReadAt: request.owner === owner ? request.requesterReadAt : null,
    volunteerReadAt: request.volunteerOwner === owner ? request.volunteerReadAt : null,
  };
}
export const helpRequestViewSchema = z
  .object({
    id: z.uuid(),
    requesterName: z.string().min(1).max(100),
    title: z.string().min(3).max(120),
    details: z.string().min(10).max(2000),
    category: helpCategorySchema,
    status: helpStatusSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    assignedAt: z.iso.datetime().nullable(),
    resolvedAt: z.iso.datetime().nullable(),
    revision: z.uuid(),
    isRequester: z.boolean(),
    isVolunteer: z.boolean(),
    volunteerName: z.string().min(1).max(100).nullable(),
    abuseReported: z.boolean(),
    requesterReadAt: z.iso.datetime().nullable(),
    volunteerReadAt: z.iso.datetime().nullable(),
  })
  .strict();
export type HelpRequestView = z.infer<typeof helpRequestViewSchema>;
export const helpVolunteerViewSchema = helpVolunteerSchema.omit({ owner: true }).strict();
export type HelpVolunteerView = z.infer<typeof helpVolunteerViewSchema>;

export function assistanceAlerts(requests: HelpRequest[], owner: string) {
  return requests
    .filter((request) => helpParticipant(request, owner) && ['assigned', 'in-progress'].includes(request.status))
    .map((request) => ({
      id: `assistance:${request.id}`,
      category: 'assistance' as const,
      priority: 'attention' as const,
      title: request.title,
      detail: `${request.owner === owner ? 'Your help request' : 'Your volunteer assignment'} is ${request.status}. Open the private assistance chat to coordinate.`,
      href: '/help' as const,
      action: 'Open player assistance',
    }));
}
