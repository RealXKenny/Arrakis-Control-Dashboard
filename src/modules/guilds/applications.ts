import { z } from 'zod';

export const guildApplicationInputSchema = z.object({
  playStyle: z.enum(['PvE', 'PvP', 'Both']),
  timezone: z.string().trim().min(1).max(80),
  availability: z.string().trim().min(1).max(300),
  experience: z.string().trim().min(1).max(800),
  message: z.string().trim().min(1).max(1500),
  answers: z
    .record(z.uuid(), z.string().trim().max(1000))
    .refine((answers) => Object.keys(answers).length <= 8)
    .optional(),
  questionVersion: z.string().max(4096).optional(),
});
export const guildApplicationSchema = guildApplicationInputSchema
  .omit({ answers: true, questionVersion: true })
  .extend({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    discordId: z.string().min(1).max(128),
    discordName: z.string().min(1).max(200),
    characterName: z.string().min(1).max(200),
    submittedAt: z.number().int().positive().safe(),
    status: z.enum(['pending', 'accepted', 'declined']),
    conversationId: z.uuid().optional(),
    customAnswers: z
      .array(
        z.object({
          questionId: z.uuid(),
          question: z.string().trim().min(1).max(200),
          answer: z.string().trim().max(1000),
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
