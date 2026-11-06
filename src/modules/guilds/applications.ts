import { z } from 'zod';

export const guildApplicationInputSchema = z.object({
  playStyle: z.enum(['PvE', 'PvP', 'Both']),
  timezone: z.string().trim().min(1).max(80),
  availability: z.string().trim().min(1).max(300),
  experience: z.string().trim().min(1).max(800),
  message: z.string().trim().min(1).max(1500),
});
export const guildApplicationSchema = guildApplicationInputSchema.extend({
  id: z.string().regex(/^[a-f0-9]{64}$/),
  discordId: z.string().min(1).max(128),
  discordName: z.string().min(1).max(200),
  characterName: z.string().min(1).max(200),
  submittedAt: z.number().int().positive().safe(),
  status: z.enum(['pending', 'accepted', 'declined']),
});
export const guildApplicationReviewSchema = z.object({
  applicationId: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(['accepted', 'declined', 'remove']),
});
export type GuildApplicationInput = z.infer<typeof guildApplicationInputSchema>;
export type GuildApplication = z.infer<typeof guildApplicationSchema>;
