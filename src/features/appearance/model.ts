import { z } from 'zod';
export const appearanceKey = 'arrakis-appearance-v1';
export const appearanceCacheKey = 'arrakis-appearance-cache-v1';
export const colorNames = [
  'background',
  'panel',
  'raised',
  'text',
  'muted',
  'accent',
  'secondary',
  'border',
  'success',
  'warning',
  'danger',
] as const;
export type ColorName = (typeof colorNames)[number];
const hex = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/)
  .transform((v) => v.toLowerCase());
export const colorsSchema = z
  .object({
    background: hex,
    panel: hex,
    raised: hex,
    text: hex,
    muted: hex,
    accent: hex,
    secondary: hex,
    border: hex,
    success: hex,
    warning: hex,
    danger: hex,
  })
  .strict();
export type AppearanceColors = z.infer<typeof colorsSchema>;
export const defaultColors: AppearanceColors = {
  background: '#0d0f12',
  panel: '#171a1d',
  raised: '#202428',
  text: '#f3efe7',
  muted: '#ad9f89',
  accent: '#c68b4a',
  secondary: '#85b7eb',
  border: '#4d4032',
  success: '#9be6bd',
  warning: '#ffd08a',
  danger: '#ffb4a8',
};
export const preferenceSchema = z
  .object({
    version: z.literal(1),
    selected: z.string().regex(/^(default|custom|[a-z][a-z0-9-]{1,63})$/),
    custom: colorsSchema,
  })
  .strict();
export type AppearancePreference = z.infer<typeof preferenceSchema>;
export const defaultPreference = (): AppearancePreference => ({
  version: 1,
  selected: 'default',
  custom: { ...defaultColors },
});
export const colorLabels: Record<ColorName, string> = {
  background: 'Page background',
  panel: 'Panel surface',
  raised: 'Raised surface',
  text: 'Primary text',
  muted: 'Muted text',
  accent: 'Primary accent',
  secondary: 'Secondary accent',
  border: 'Borders',
  success: 'Success',
  warning: 'Warning',
  danger: 'Danger',
};
export const paletteShades = {
  obsidian: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  sand: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  spice: [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950],
  ibad: [300, 400, 500, 600],
  status: ['ok', 'warn', 'danger'],
} as const;
export const roleNames = [
  'surface',
  'raised',
  'hover',
  'background',
  'text',
  'muted',
  'accent',
  'on-accent',
  'border',
  'soft',
  'success',
  'danger',
  'masthead',
  'header',
  'menu',
  'header-border',
  'ink',
  'ink-strong',
  'accent-ink',
  'accent-soft',
  'accent-rgb',
  'text-rgb',
  'panel-rgb',
  'border-rgb',
] as const;
export const ownedColorProperties: string[] = [
  ...Object.entries(paletteShades).flatMap(([group, shades]) => shades.map((shade) => `--color-${group}-${shade}`)),
  ...roleNames.map((name) => `--theme-${name}`),
];
