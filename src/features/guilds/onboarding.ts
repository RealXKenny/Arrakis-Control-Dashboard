import { z } from 'zod';

export const ONBOARDING_MEMBER_LIMIT = 200;
export const onboardingGuildId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const onboardingMemberKey = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.uuid().nullable();
const step = z.object({ id: z.uuid(), text: z.string().trim().min(1).max(200) }).strict();
export const onboardingGuideSchema = z
  .object({
    welcome: z.string().trim().max(2000),
    rules: z.string().trim().max(4000),
    locations: z.string().trim().max(2000),
    steps: z
      .array(step)
      .max(20)
      .refine((steps) => new Set(steps.map((value) => value.id)).size === steps.length),
  })
  .strict();
export const onboardingProgressSchema = z.object({
  memberKey: onboardingMemberKey,
  memberName: z.string().min(1).max(200),
  mentorKey: onboardingMemberKey.nullable(),
  completed: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length),
  rulesRevision: revision,
  updatedAt: z.iso.datetime(),
});
export const onboardingBookSchema = z.object({
  guildId: onboardingGuildId,
  revision,
  rulesRevision: revision,
  guide: onboardingGuideSchema,
  members: z
    .array(onboardingProgressSchema)
    .max(ONBOARDING_MEMBER_LIMIT)
    .refine((members) => new Set(members.map((member) => member.memberKey)).size === members.length),
});
export const onboardingInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('guide'), revision, guide: onboardingGuideSchema }).strict(),
  z.object({ action: z.literal('complete'), revision, stepId: z.uuid(), completed: z.boolean() }).strict(),
  z.object({ action: z.literal('acknowledge-rules'), revision }).strict(),
  z
    .object({
      action: z.literal('mentor'),
      revision,
      memberKey: onboardingMemberKey,
      mentorKey: onboardingMemberKey.nullable(),
    })
    .strict(),
  z.object({ action: z.literal('remove-progress'), revision, memberKey: onboardingMemberKey }).strict(),
]);
const progressView = onboardingProgressSchema.extend({
  mentorName: z.string().max(200).nullable(),
  currentMember: z.boolean(),
});
export const onboardingViewSchema = z.object({
  revision,
  rulesRevision: revision,
  guide: onboardingGuideSchema,
  canEdit: z.boolean(),
  self: progressView.nullable(),
  members: z.array(progressView).max(ONBOARDING_MEMBER_LIMIT),
  roster: z.array(z.object({ key: onboardingMemberKey, name: z.string().min(1).max(200) })).max(500),
});
export type OnboardingGuide = z.infer<typeof onboardingGuideSchema>;
export type OnboardingBook = z.infer<typeof onboardingBookSchema>;
export type OnboardingInput = z.infer<typeof onboardingInputSchema>;
export type OnboardingView = z.infer<typeof onboardingViewSchema>;
export function emptyOnboarding(guildId: string): OnboardingBook {
  return {
    guildId: onboardingGuildId.parse(guildId),
    revision: null,
    rulesRevision: null,
    guide: { welcome: '', rules: '', locations: '', steps: [] },
    members: [],
  };
}
