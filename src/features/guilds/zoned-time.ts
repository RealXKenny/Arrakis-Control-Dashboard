/** Browser-safe IANA timezone helpers for weekly planning. All persisted instants stay UTC. */

export const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const clockPattern = /^([01]\d|2[0-3]):[0-5]\d$/;

export function validTimeZone(zone: string): boolean {
  if (!zone || zone.length > 80) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(0);
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(zone: string) {
  let value = formatters.get(zone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    });
    formatters.set(zone, value);
  }
  return value;
}
const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; weekday: number };

export function zonedParts(ms: number, zone: string): ZonedParts {
  const parts = Object.fromEntries(
    formatter(zone)
      .formatToParts(new Date(ms))
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdays[parts.weekday] ?? 0,
  };
}

function offset(ms: number, zone: string) {
  const parts = zonedParts(ms, zone);
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - Math.floor(ms / 60_000) * 60_000;
}

/**
 * UTC instant for a wall-clock time in a zone. Repeated times resolve to the first occurrence; a time
 * skipped by a daylight-saving jump moves forward by the gap (02:30 becomes 03:30).
 */
export function zonedToUtc(
  date: { year: number; month: number; day: number },
  clock: { hour: number; minute: number },
  zone: string,
): number {
  const wall = Date.UTC(date.year, date.month - 1, date.day, clock.hour, clock.minute);
  const before = wall - offset(wall - 43_200_000, zone);
  const after = wall - offset(wall + 43_200_000, zone);
  const matches = [before, after].filter((candidate) => candidate + offset(candidate, zone) === wall);
  return matches.length ? Math.min(...matches) : before;
}

export function parseClock(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return { hour, minute };
}

/** The zone's calendar date `offset` days after the date containing `ms`. */
export function zonedDate(ms: number, zone: string, offset: number) {
  const parts = zonedParts(ms, zone);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}
