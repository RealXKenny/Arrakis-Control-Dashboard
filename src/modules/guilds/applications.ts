import { z } from 'zod';
import { guildQuestionTypeSchema } from './requirements';

export const guildApplicationInputSchema = z.object({
  answers: z
    .record(z.uuid(), z.union([z.string().trim().max(1000), z.boolean()]))
    .refine((answers) => Object.keys(answers).length <= 8)
    .optional(),
  questionVersion: z.string().max(40000).optional(),
});
export const guildApplicationSchema = guildApplicationInputSchema
  .omit({ answers: true, questionVersion: true })
  .extend({
    // Older submissions keep their original standard answers for review.
    playStyle: z.enum(['PvE', 'PvP', 'Both']).optional(),
    timezone: z.string().trim().max(80).optional(),
    availability: z.string().trim().max(300).optional(),
    experience: z.string().trim().max(800).optional(),
    message: z.string().trim().max(1500).optional(),
    id: z.string().regex(/^[a-f0-9]{64}$/),
    discordId: z.string().min(1).max(128),
    discordName: z.string().min(1).max(200),
    characterName: z.string().min(1).max(200),
    playerId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]{1,128}$/)
      .optional(),
    submittedAt: z.number().int().positive().safe(),
    status: z.enum(['pending', 'accepted', 'declined']),
    conversationId: z.uuid().optional(),
    customAnswers: z
      .array(
        z.object({
          questionId: z.uuid(),
          question: z.string().trim().min(1).max(200),
          type: guildQuestionTypeSchema.optional(),
          answer: z.union([z.string().trim().max(1000), z.boolean()]),
        }),
      )
      .max(8)
      .optional(),
  });
export const guildApplicationReviewSchema = z.object({
  applicationId: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['accepted', 'declined', 'remove']),
});
export type GuildApplicationInput = z.infer<typeof guildApplicationInputSchema>;
export type GuildApplication = z.infer<typeof guildApplicationSchema>;
export const guildApplicationSummarySchema = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['pending', 'accepted', 'declined']),
  unreadCount: z.number().int().min(0).max(100),
});
export type GuildApplicationSummary = z.infer<typeof guildApplicationSummarySchema>;

export const guildChatInputSchema = z.object({ clientMessageId: z.uuid(), text: z.string().trim().min(1).max(1000) });
export const guildChatMessageSchema = z.object({
  id: z.uuid(),
  text: z.string().trim().min(1).max(1000),
  senderId: z.string().min(1).max(128),
  senderName: z.string().min(1).max(200),
  role: z.enum(['applicant', 'reviewer']),
  sentAt: z.number().int().positive().safe(),
});
export type GuildChatMessage = z.infer<typeof guildChatMessageSchema>;
