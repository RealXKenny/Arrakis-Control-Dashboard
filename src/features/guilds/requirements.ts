import { z } from 'zod';

export const guildQuestionTypeSchema = z.enum(['shortText', 'longText', 'dropdown', 'timezone', 'checkbox', 'number']);
export const guildApplicationQuestionSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200),
    required: z.boolean(),
    type: guildQuestionTypeSchema.optional(),
    options: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  })
  .refine(
    (question) =>
      question.type === 'dropdown'
        ? (question.options?.length ?? 0) >= 2 && new Set(question.options).size === question.options.length
        : !question.options?.length,
    'Dropdown questions need two to thirty unique choices; other field types do not use choices.',
  );
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
