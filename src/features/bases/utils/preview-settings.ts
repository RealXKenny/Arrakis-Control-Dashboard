import { z } from 'zod';

const vector = z
  .tuple([
    z.number().finite().min(-100).max(100),
    z.number().finite().min(-100).max(100),
    z.number().finite().min(-100).max(100),
  ] as const)
  .transform((value): [number, number, number] => [value[0], value[1], value[2]]);
export const baseViewSchema = z
  .object({
    position: vector,
    target: vector,
    facing: z.number().finite().min(-180).max(180),
  })
  .refine((view) => Math.hypot(...view.position.map((v, i) => v - view.target[i])) > 0.01);
export type BaseView = z.infer<typeof baseViewSchema>;
export const previewSettingsSchema = z.object({
  view: baseViewSchema,
  image: z
    .string()
    .max(1400000)
    .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/),
  revision: z.string().regex(/^[a-f0-9]{24}$/),
});
export type PreviewSettings = z.infer<typeof previewSettingsSchema>;
