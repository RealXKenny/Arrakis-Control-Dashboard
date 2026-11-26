import { z } from 'zod';
import { clockPattern, parseClock, validTimeZone, zonedDate, zonedToUtc } from './zoned-time';

export const AVAILABILITY_ENTRY_LIMIT = 500;
export const AVAILABILITY_WINDOW_LIMIT = 14;
export const AVAILABILITY_STALE_DAYS = 30;
export const AVAILABILITY_HOURS = 168;

const window = z
  .object({
    day: z.number().int().min(0).max(6),
    start: z.string().regex(clockPattern),
    end: z.string().regex(clockPattern),
  })
  .strict()
  .refine((value) => value.start !== value.end, { message: 'A window needs a different start and end.' });
export const availabilityDraftSchema = z
  .object({
    timeZone: z.string().max(80).refine(validTimeZone),
    windows: z.array(window).min(1).max(AVAILABILITY_WINDOW_LIMIT),
    note: z.string().trim().max(120),
  })
  .strict();
const entryFields = {
  ...availabilityDraftSchema.shape,
  id: z.uuid(),
  name: z.string().min(1).max(200),
  updatedAt: z.iso.datetime(),
};
export const availabilityEntrySchema = z.object({
  ...entryFields,
  memberId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
});
export const availabilityDocumentSchema = z
  .object({
    revision: z.uuid(),
    entries: z
      .array(availabilityEntrySchema)
      .max(AVAILABILITY_ENTRY_LIMIT)
      .refine((values) => new Set(values.map((entry) => entry.memberId)).size === values.length),
  })
  .strict();
export const availabilityViewSchema = z.object({
  entries: z.array(z.object({ ...entryFields, isSelf: z.boolean() })).max(AVAILABILITY_ENTRY_LIMIT),
});
export const availabilityInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), availability: availabilityDraftSchema }).strict(),
  z.object({ action: z.literal('clear') }).strict(),
]);
export type AvailabilityDraft = z.infer<typeof availabilityDraftSchema>;
export type AvailabilityDocument = z.infer<typeof availabilityDocumentSchema>;
export type AvailabilityInput = z.infer<typeof availabilityInputSchema>;
export type AvailabilityView = z.infer<typeof availabilityViewSchema>;
export type AvailabilityEntryView = AvailabilityView['entries'][number];
export type AvailabilitySlot = { start: number; names: string[] };

/** Weekly local windows as UTC intervals across the planning period, using each member's own zone and DST. */
export function availabilityIntervals(
  entry: Pick<AvailabilityDraft, 'timeZone' | 'windows'>,
  from: number,
  days: number,
) {
  const intervals: Array<[number, number]> = [];
  for (let offset = -1; offset <= days; offset += 1) {
    const date = zonedDate(from, entry.timeZone, offset);
    for (const window of entry.windows) {
      if (window.day !== date.weekday) continue;
      const start = zonedToUtc(date, parseClock(window.start), entry.timeZone);
      const endClock = parseClock(window.end);
      const crosses = window.end <= window.start;
      const end = zonedToUtc(
        crosses ? zonedDate(start + 12 * 3_600_000, entry.timeZone, 0) : date,
        endClock,
        entry.timeZone,
      );
      if (end > start) intervals.push([start, end]);
    }
  }
  return intervals;
}

/**
 * Hourly slots for the next week. A member counts for an hour only when one of their windows covers
 * all of it. Self-reported availability is a planning aid, not a commitment to attend.
 */
export function availabilityBoard(
  entries: Array<Pick<AvailabilityEntryView, 'name' | 'timeZone' | 'windows'>>,
  now: number,
  hours = AVAILABILITY_HOURS,
): AvailabilitySlot[] {
  const first = Math.ceil(now / 3_600_000) * 3_600_000;
  const slots: AvailabilitySlot[] = Array.from({ length: hours }, (_, index) => ({
    start: first + index * 3_600_000,
    names: [],
  }));
  for (const entry of entries) {
    const intervals = availabilityIntervals(entry, first, Math.ceil(hours / 24) + 1);
    for (const slot of slots) {
      if (intervals.some(([start, end]) => start <= slot.start && end >= slot.start + 3_600_000))
        slot.names.push(entry.name);
    }
  }
  return slots;
}

/** Best start times for a run of `length` hours: highest guaranteed attendance first, then earliest. */
export function bestStartTimes(slots: AvailabilitySlot[], length = 2, limit = 5) {
  const options: Array<{ start: number; available: number; names: string[] }> = [];
  for (let index = 0; index + length <= slots.length; index += 1) {
    const run = slots.slice(index, index + length);
    const names = run[0].names.filter((name) => run.every((slot) => slot.names.includes(name)));
    if (names.length) options.push({ start: run[0].start, available: names.length, names });
  }
  const chosen: typeof options = [];
  for (const option of options.sort((a, b) => b.available - a.available || a.start - b.start)) {
    // Skip starts that overlap a better option so suggestions are distinct.
    if (chosen.some((entry) => Math.abs(entry.start - option.start) < length * 3_600_000)) continue;
    chosen.push(option);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

export function availabilityStale(updatedAt: string, now: number) {
  return now - Date.parse(updatedAt) > AVAILABILITY_STALE_DAYS * 86_400_000;
}
