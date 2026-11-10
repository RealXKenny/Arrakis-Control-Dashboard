import { z } from 'zod';

export const GUILD_POLL_LIMIT = 20;
export const POLL_VOTER_LIMIT = 500;
export const pollGuildId = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export const pollDraftSchema = z
  .object({
    id: z.uuid(),
    question: z.string().trim().min(1).max(200),
    details: z.string().trim().max(1500),
    closesAt: z.iso.datetime(),
    options: z
      .array(z.object({ id: z.uuid(), text: z.string().trim().min(1).max(100) }).strict())
      .min(2)
      .max(10)
      .refine(
        (options) =>
          new Set(options.map((option) => option.id)).size === options.length &&
          new Set(options.map((option) => option.text.toLocaleLowerCase())).size === options.length,
      ),
  })
  .strict();
const fields = {
  ...pollDraftSchema.shape,
  revision: z.uuid(),
  status: z.enum(['open', 'closed']),
  createdAt: z.iso.datetime(),
  organizerName: z.string().min(1).max(200),
};
export const storedPollSchema = z
  .object({
    ...fields,
    votes: z.array(z.object({ memberId: pollGuildId, optionId: z.uuid() })).max(POLL_VOTER_LIMIT),
  })
  .refine(
    (poll) =>
      new Set(poll.votes.map((vote) => vote.memberId)).size === poll.votes.length &&
      poll.votes.every((vote) => poll.options.some((option) => option.id === vote.optionId)),
  );
export const pollViewSchema = z.object({
  ...fields,
  closed: z.boolean(),
  ownOptionId: z.uuid().nullable(),
  totalVotes: z.number().int().min(0).max(POLL_VOTER_LIMIT),
  results: z
    .array(z.object({ optionId: z.uuid(), count: z.number().int().min(0).max(POLL_VOTER_LIMIT) }))
    .min(2)
    .max(10),
});
export const pollsViewSchema = z.object({ canEdit: z.boolean(), polls: z.array(pollViewSchema).max(GUILD_POLL_LIMIT) });
const target = { id: z.uuid(), revision: z.uuid() };
export const pollInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), poll: pollDraftSchema }).strict(),
  z.object({ action: z.literal('vote'), ...target, optionId: z.uuid() }).strict(),
  z.object({ action: z.literal('withdraw'), ...target }).strict(),
  z.object({ action: z.literal('close'), ...target }).strict(),
  z.object({ action: z.literal('delete'), ...target }).strict(),
]);
export type PollDraft = z.infer<typeof pollDraftSchema>;
export type StoredPoll = z.infer<typeof storedPollSchema>;
export type PollInput = z.infer<typeof pollInputSchema>;
export type PollView = z.infer<typeof pollViewSchema>;
export type PollsView = z.infer<typeof pollsViewSchema>;
