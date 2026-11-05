import { z } from 'zod';

export const guildRequirementSchema = z
  .object({
    guildName: z.string().trim().min(1).max(100),
    requirements: z.string().trim().max(2000),
    contact: z.string().trim().max(200),
    published: z.boolean(),
  })
  .refine((value) => !value.published || value.requirements.length > 0, {
    message: 'Add joining requirements before publishing.',
    path: ['requirements'],
  });

export type GuildRequirement = z.infer<typeof guildRequirementSchema>;
export type GuildRequirementListing = GuildRequirement & { guildId: string };
