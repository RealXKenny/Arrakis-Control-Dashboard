import { z } from 'zod';

export const guildApplicationQuestionSchema = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(200),
  required: z.boolean(),
});
export type GuildApplicationQuestion = z.infer<typeof guildApplicationQuestionSchema>;

export const guildRequirementSchema = z
  .object({
    guildName: z.string().trim().min(1).max(100),
    requirements: z.string().trim().max(2000),
    contact: z.string().trim().max(200),
    published: z.boolean(),
    applicationQuestions: z
      .array(guildApplicationQuestionSchema)
      .max(8)
      .refine(
        (questions) => new Set(questions.map((question) => question.id)).size === questions.length,
        'Question IDs must be unique.',
      )
      .optional(),
  })
  .refine((value) => !value.published || value.requirements.length > 0, {
    message: 'Add joining requirements before publishing.',
    path: ['requirements'],
  });

export type GuildRequirement = z.infer<typeof guildRequirementSchema>;
export type GuildRequirementListing = GuildRequirement & { guildId: string };
