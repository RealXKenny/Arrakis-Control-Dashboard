/** Shared sRGB helpers, adapted from RedBlink's MIT theme engine; see appearance provenance. */
export type RGB = [number, number, number];
export const parseHex = (hex: string): RGB =>
  [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)) as RGB;
export const toHex = (rgb: RGB) =>
  `#${rgb
    .map((v) =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
export const mix = (a: RGB, b: RGB, amount: number): RGB =>
  a.map((v, i) => v + (b[i] - v) * Math.min(1, Math.max(0, amount))) as RGB;
export function luminance(rgb: RGB) {
  const [r, g, b] = rgb.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: RGB, b: RGB) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function ensureContrast(color: RGB, surfaces: RGB[], ratio = 4.8): RGB {
  const score = (c: RGB) => Math.min(...surfaces.map((surface) => contrast(c, surface)));
  if (score(parseHex(toHex(color))) >= ratio) return parseHex(toHex(color));
  const ends: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
  ];
  ends.sort((a, b) => score(b) - score(a));
  for (const end of ends)
    for (let step = 1; step <= 100; step++) {
      const candidate = parseHex(toHex(mix(color, end, step / 100)));
      if (score(candidate) >= ratio) return candidate;
    }
  return ends[0];
}
