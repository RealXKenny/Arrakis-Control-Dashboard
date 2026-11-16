import { SOURCE_PALETTES } from './source-palettes';
import { HOUSE_SWATCHES } from './house-swatches';
import { defaultColors, type AppearanceColors } from './model';
import { contrast, luminance, mix, parseHex, toHex, type RGB } from './colors';
export type AppearancePalette = {
  id: string;
  group: string;
  name: string;
  description: string;
  colors: AppearanceColors;
  dyes?: readonly string[];
};
function fromFour(c: { background: string; panel: string; accent: string; secondary: string }): AppearanceColors {
  return {
    ...defaultColors,
    background: c.background,
    panel: c.panel,
    accent: c.accent,
    secondary: c.secondary,
    raised: toHex(mix(parseHex(c.panel), parseHex(c.accent), 0.055)),
    border: toHex(mix(parseHex(c.panel), parseHex(defaultColors.text), 0.24)),
  };
}
function fromSwatch(colors: readonly string[]) {
  const dyes = colors.map(parseHex);
  const ordered = [...dyes].sort((a, b) => luminance(a) - luminance(b));
  const black: RGB = [0, 0, 0];
  let bg = ordered[0];
  for (let t = 0.3; luminance(bg) > 0.012 && t <= 0.9; t += 0.1) bg = mix(ordered[0], black, t);
  let panel = mix(bg, ordered[1], 0.5);
  for (let t = 0.3; luminance(panel) < 0.025 && t <= 0.9; t += 0.1) panel = mix(bg, ordered[1], t);
  panel = mix(panel, [255, 255, 255], luminance(panel) < 0.02 ? 0.06 : 0);
  const vivid = (c: RGB) => Math.max(...c) - Math.min(...c);
  const bright = dyes.filter((c) => luminance(c) >= 0.08);
  const pool = (bright.length >= 2 ? bright : ordered.slice(-2)).sort(
    (a, b) => vivid(b) - vivid(a) || luminance(b) - luminance(a),
  );
  const accent = pool[0];
  const secondary =
    pool.find((c) => contrast(c, accent) >= 1.3) ?? pool.find((c) => toHex(c) !== toHex(accent)) ?? accent;
  return fromFour({ background: toHex(bg), panel: toHex(panel), accent: toHex(accent), secondary: toHex(secondary) });
}
export const appearancePalettes: readonly AppearancePalette[] = [
  {
    id: 'default',
    group: 'Arrakis Control',
    name: 'Default',
    description: 'The Console default: graphite surfaces, warm neutral text and copper accents.',
    colors: defaultColors,
  },
  ...SOURCE_PALETTES.map((p) => ({ ...p, colors: fromFour(p) })),
  ...HOUSE_SWATCHES.map((p) => ({
    id: p.id,
    group: p.group,
    name: p.name,
    description: `House and outfit dye colors: ${p.name}.`,
    colors: fromSwatch(p.colors),
    dyes: p.colors,
  })),
];
