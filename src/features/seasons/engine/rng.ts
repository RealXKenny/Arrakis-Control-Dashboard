/** Deterministic, dependency-free hashing and seeded choice. Browser-safe; same input always yields the same output. */
function hash32(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash >>> 0;
}
export function seededRandom(seed: string) {
  let state = hash32(seed) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function weightedPick<T>(items: ReadonlyArray<{ item: T; weight: number }>, random: () => number): T | null {
  const usable = items.filter((v) => v.weight > 0 && Number.isFinite(v.weight));
  const total = usable.reduce((sum, v) => sum + v.weight, 0);
  if (!usable.length || total <= 0) return null;
  let point = random() * total;
  for (const entry of usable) {
    point -= entry.weight;
    if (point < 0) return entry.item;
  }
  return usable[usable.length - 1].item;
}
