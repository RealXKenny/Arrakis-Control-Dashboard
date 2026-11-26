/** A private planning pin passed in the member's own URL, e.g. from an operation waypoint. Never stored by the map. */
export type MapPin = { x: number; y: number; label: string };

const LIMIT = 10_000_000;

export function parseMapPin(params: Record<string, string | string[] | undefined>): MapPin | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const match = /^(-?\d{1,8}),(-?\d{1,8})$/.exec(first(params.pin) ?? '');
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (Math.abs(x) > LIMIT || Math.abs(y) > LIMIT) return null;
  const label = (first(params.label) ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Planning pin';
  return { x, y, label };
}
