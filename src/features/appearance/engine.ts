import { appearancePalettes } from './catalog';
import {
  colorsSchema,
  defaultColors,
  defaultPreference,
  ownedColorProperties,
  paletteShades,
  preferenceSchema,
  type AppearanceColors,
  type AppearancePreference,
} from './model';
import { contrast, ensureContrast, luminance, mix, parseHex, toHex, type RGB } from './colors';
export function normalizePreference(raw: unknown): AppearancePreference {
  const parsed = preferenceSchema.safeParse(raw);
  return parsed.success &&
    (parsed.data.selected === 'custom' || appearancePalettes.some((p) => p.id === parsed.data.selected))
    ? parsed.data
    : defaultPreference();
}
export function deriveAppearance(raw: AppearanceColors): {
  tokens: Record<string, string>;
  colors: AppearanceColors;
  appearance: 'dark' | 'light';
} {
  const c = colorsSchema.parse(raw);
  const bg = parseHex(c.background);
  const end: RGB = luminance(bg) > 0.179 ? [0, 0, 0] : [255, 255, 255];
  const floor = Math.min(7, contrast(end, bg));
  const fitSurface = (color: RGB) => {
    for (let step = 0; step <= 100; step++) {
      const candidate = parseHex(toHex(mix(color, bg, step / 100)));
      if (contrast(end, candidate) >= floor - 0.005) return candidate;
    }
    return bg;
  };
  const panel = fitSurface(parseHex(c.panel));
  const raised = fitSurface(parseHex(c.raised));
  const hover = fitSurface(mix(raised, end, 0.025));
  const surfaces = [bg, panel, raised, hover];
  const readable = (color: RGB, ratio = 4.65) =>
    ensureContrast(color, surfaces, Math.min(ratio, ...surfaces.map((s) => contrast(end, s))));
  const text = readable(parseHex(c.text), 7);
  const muted = readable(parseHex(c.muted));
  const accent = readable(parseHex(c.accent));
  const secondary = readable(parseHex(c.secondary));
  const tokens: Record<string, string> = {};
  const set = (name: string, color: RGB) => {
    tokens[name] = toHex(color);
  };
  for (const shade of paletteShades.obsidian) {
    const color =
      shade === 950
        ? bg
        : shade === 900
          ? panel
          : shade === 800
            ? raised
            : shade === 700
              ? hover
              : shade >= 500
                ? mix(raised, muted, (700 - shade) / 300)
                : readable(mix(text, muted, shade / 650));
    set(`--color-obsidian-${shade}`, color);
  }
  for (const shade of paletteShades.sand)
    set(
      `--color-sand-${shade}`,
      shade <= 500
        ? readable(mix(text, muted, (shade - 50) / 450), shade <= 200 ? 7 : 4.65)
        : mix(panel, muted, (950 - shade) / 600),
    );
  for (const shade of paletteShades.spice)
    set(
      `--color-spice-${shade}`,
      shade <= 600
        ? readable(mix(accent, text, Math.max(0, (500 - shade) / 1000)))
        : mix(accent, bg, (shade - 600) / 420),
    );
  for (const shade of paletteShades.ibad)
    set(`--color-ibad-${shade}`, readable(mix(secondary, text, Math.max(0, (500 - shade) / 850))));
  const success = readable(parseHex(c.success));
  const warning = readable(parseHex(c.warning));
  const danger = readable(parseHex(c.danger));
  set('--color-status-ok', success);
  set('--color-status-warn', warning);
  set('--color-status-danger', danger);
  const border = ensureContrast(
    parseHex(c.border),
    [bg, panel, raised],
    Math.min(3.1, ...surfaces.map((s) => contrast(end, s))),
  );
  const roles: Record<string, RGB> = {
    background: bg,
    surface: panel,
    raised,
    hover,
    text,
    muted,
    accent,
    'on-accent': bg,
    border,
    soft: readable(mix(text, muted, 0.4)),
    success,
    danger,
    masthead: bg,
    header: fitSurface(mix(bg, panel, 0.25)),
    menu: panel,
    'header-border': border,
    ink: muted,
    'ink-strong': text,
    'accent-ink': accent,
    'accent-soft': readable(mix(accent, text, 0.3)),
  };
  for (const [name, color] of Object.entries(roles)) set(`--theme-${name}`, color);
  for (const [name, color] of Object.entries({ accent, text, panel, border }))
    tokens[`--theme-${name}-rgb`] = color.map(Math.round).join(' ');
  return {
    tokens,
    colors: {
      ...c,
      background: toHex(bg),
      panel: toHex(panel),
      raised: toHex(raised),
      text: toHex(text),
      muted: toHex(muted),
      accent: toHex(accent),
      secondary: toHex(secondary),
      border: toHex(border),
      success: toHex(success),
      warning: toHex(warning),
      danger: toHex(danger),
    },
    appearance: luminance(bg) > 0.179 ? 'light' : 'dark',
  };
}
export function colorsForPreference(pref: AppearancePreference) {
  return pref.selected === 'custom'
    ? pref.custom
    : (appearancePalettes.find((p) => p.id === pref.selected)?.colors ?? defaultColors);
}
export function clearAppearance(root: HTMLElement = document.documentElement) {
  ownedColorProperties.forEach((name) => root.style.removeProperty(name));
  root.style.removeProperty('color-scheme');
  delete root.dataset.appearance;
}
export function applyAppearance(pref: AppearancePreference, root: HTMLElement = document.documentElement) {
  clearAppearance(root);
  if (pref.selected === 'default') return null;
  const result = deriveAppearance(colorsForPreference(pref));
  for (const [name, value] of Object.entries(result.tokens)) root.style.setProperty(name, value);
  root.style.setProperty('color-scheme', result.appearance);
  root.dataset.appearance = pref.selected;
  return result;
}
