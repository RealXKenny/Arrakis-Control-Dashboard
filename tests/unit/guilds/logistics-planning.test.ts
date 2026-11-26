import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  availabilityBoard,
  availabilityDraftSchema,
  availabilityIntervals,
  bestStartTimes,
} from '../../../src/features/guilds/availability';
import { bookingConflicts, validBookingWindow } from '../../../src/features/guilds/fleet';
import { landsraadObservation } from '../../../src/features/guilds/landsraad-campaign';
import {
  nextTemplateStart,
  operationFromTemplate,
  templateDraftSchema,
  templateFromOperation,
  type StoredTemplate,
} from '../../../src/features/guilds/operation-templates';
import { operationDraftSchema } from '../../../src/features/guilds/operations';
import { zonedParts, zonedToUtc } from '../../../src/features/guilds/zoned-time';

describe('timezone helpers', () => {
  it('converts wall-clock times across daylight-saving changes', () => {
    expect(
      new Date(zonedToUtc({ year: 2027, month: 1, day: 9 }, { hour: 19, minute: 0 }, 'Europe/Berlin')).toISOString(),
    ).toBe('2027-01-09T18:00:00.000Z');
    expect(
      new Date(zonedToUtc({ year: 2027, month: 7, day: 10 }, { hour: 19, minute: 0 }, 'Europe/Berlin')).toISOString(),
    ).toBe('2027-07-10T17:00:00.000Z');
    // 02:30 does not exist on the US spring-forward day; it lands on the next valid wall-clock time.
    const skipped = zonedToUtc({ year: 2027, month: 3, day: 14 }, { hour: 2, minute: 30 }, 'America/New_York');
    expect(zonedParts(skipped, 'America/New_York').hour).toBe(3);
  });
});

describe('N062 availability board', () => {
  const now = Date.parse('2027-01-04T00:00:00.000Z'); // Monday
  it('places windows from different timezones on one UTC timeline and finds the shared hours', () => {
    const entries = [
      { name: 'Berlin', timeZone: 'Europe/Berlin', windows: [{ day: 2, start: '19:00', end: '23:00' }] },
      { name: 'New York', timeZone: 'America/New_York', windows: [{ day: 2, start: '13:00', end: '18:00' }] },
    ];
    const slots = availabilityBoard(entries, now);
    expect(slots).toHaveLength(168);
    const both = slots.filter((slot) => slot.names.length === 2).map((slot) => new Date(slot.start).toISOString());
    // Berlin 19–23 = 18–22 UTC; New York 13–18 = 18–23 UTC: both are free 18:00–22:00 UTC on Tuesday.
    expect(both).toEqual([
      '2027-01-05T18:00:00.000Z',
      '2027-01-05T19:00:00.000Z',
      '2027-01-05T20:00:00.000Z',
      '2027-01-05T21:00:00.000Z',
    ]);
    const best = bestStartTimes(slots, 3);
    expect(new Date(best[0].start).toISOString()).toBe('2027-01-05T18:00:00.000Z');
    expect(best[0]).toMatchObject({ available: 2, names: ['Berlin', 'New York'] });
    expect(best.every((option, index) => index === 0 || Math.abs(option.start - best[0].start) >= 3 * 3_600_000)).toBe(
      true,
    );
  });
  it('supports windows that cross midnight and counts only fully covered hours', () => {
    const intervals = availabilityIntervals(
      { timeZone: 'UTC', windows: [{ day: 5, start: '22:30', end: '01:00' }] },
      now,
      7,
    );
    expect(
      intervals.map(([start, end]) => [new Date(start).toISOString(), new Date(end).toISOString()]),
    ).toContainEqual(['2027-01-08T22:30:00.000Z', '2027-01-09T01:00:00.000Z']);
    const slots = availabilityBoard(
      [{ name: 'Owl', timeZone: 'UTC', windows: [{ day: 5, start: '22:30', end: '01:00' }] }],
      now,
    );
    expect(slots.filter((slot) => slot.names.length).map((slot) => new Date(slot.start).toISOString())).toEqual([
      '2027-01-08T23:00:00.000Z',
      '2027-01-09T00:00:00.000Z',
    ]);
  });
  it('validates timezones and bounded windows', () => {
    const window = { day: 1, start: '18:00', end: '20:00' };
    expect(availabilityDraftSchema.safeParse({ timeZone: 'Asia/Tokyo', windows: [window], note: '' }).success).toBe(
      true,
    );
    expect(availabilityDraftSchema.safeParse({ timeZone: 'Mars/Olympus', windows: [window], note: '' }).success).toBe(
      false,
    );
    expect(
      availabilityDraftSchema.safeParse({ timeZone: 'UTC', windows: [{ ...window, end: '18:00' }], note: '' }).success,
    ).toBe(false);
    expect(
      availabilityDraftSchema.safeParse({ timeZone: 'UTC', windows: Array(15).fill(window), note: '' }).success,
    ).toBe(false);
  });
});

describe('N061 operation templates', () => {
  const template: StoredTemplate = {
    id: randomUUID(),
    name: 'Saturday spice',
    kind: 'spice-run',
    title: 'Saturday spice run',
    details: 'Bring water.',
    meetingPoint: 'South base',
    durationMinutes: 120,
    roles: [{ role: 'pilot', capacity: 1 }],
    preparation: [{ id: randomUUID(), text: 'Fuel cells' }],
    briefings: { pilot: 'Hold altitude.' },
    waypoints: [
      {
        id: randomUUID(),
        label: 'Rally',
        purpose: 'rally',
        map: 'HaggaBasin',
        sector: 'C4',
        x: null,
        y: null,
        note: '',
      },
    ],
    notes: '',
    cadence: 'weekly',
    weekday: 6,
    time: '19:00',
    timeZone: 'Europe/Berlin',
    updatedBy: 'Leader',
    updatedAt: '2027-01-01T00:00:00.000Z',
  };
  const monday = Date.parse('2027-01-04T12:00:00.000Z');
  it('suggests the next weekly or fortnightly start in the template timezone', () => {
    expect(new Date(nextTemplateStart(template, monday)!).toISOString()).toBe('2027-01-09T18:00:00.000Z');
    const fortnight = { ...template, cadence: 'fortnightly' as const };
    expect(new Date(nextTemplateStart(fortnight, monday, '2027-01-02T18:00:00.000Z')!).toISOString()).toBe(
      '2027-01-16T18:00:00.000Z',
    );
    expect(nextTemplateStart({ ...template, cadence: 'none' }, monday)).toBeNull();
  });
  it('creates a valid operation with fresh IDs and back-references the template', () => {
    let n = 0;
    const ids = Array.from({ length: 5 }, () => randomUUID());
    const draft = operationFromTemplate(template, Date.parse('2027-01-09T18:00:00.000Z'), () => ids[n++]);
    expect(operationDraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.templateId).toBe(template.id);
    expect(draft.endsAt).toBe('2027-01-09T20:00:00.000Z');
    expect(draft.preparation?.[0].id).not.toBe(template.preparation[0].id);
    expect(draft.waypoints?.[0].id).not.toBe(template.waypoints[0].id);
    expect(templateDraftSchema.safeParse(templateFromOperation(draft, randomUUID())).success).toBe(true);
  });
  it('requires a full schedule for recurring templates', () => {
    const { updatedAt: _a, updatedBy: _b, ...draft } = template;
    void _a;
    void _b;
    expect(templateDraftSchema.safeParse(draft).success).toBe(true);
    expect(templateDraftSchema.safeParse({ ...draft, timeZone: null }).success).toBe(false);
    expect(templateDraftSchema.safeParse({ ...draft, timeZone: 'Nowhere/City' }).success).toBe(false);
    expect(
      templateDraftSchema.safeParse({ ...draft, cadence: 'none', weekday: null, time: null, timeZone: null }).success,
    ).toBe(true);
  });
});

describe('N065 fleet bookings', () => {
  const booking = (id: string, vehicleId: string, pilotId: string, start: string, end: string) => ({
    id,
    vehicleId,
    pilotId,
    startsAt: start,
    endsAt: end,
  });
  it('detects vehicle and pilot double bookings but allows back-to-back slots', () => {
    const existing = [booking('a', 'v1', 'p1', '2027-01-01T10:00:00.000Z', '2027-01-01T12:00:00.000Z')];
    expect(
      bookingConflicts(existing, booking('b', 'v1', 'p2', '2027-01-01T11:00:00.000Z', '2027-01-01T13:00:00.000Z'))
        .vehicle?.id,
    ).toBe('a');
    expect(
      bookingConflicts(existing, booking('b', 'v2', 'p1', '2027-01-01T11:59:00.000Z', '2027-01-01T13:00:00.000Z')).pilot
        ?.id,
    ).toBe('a');
    expect(
      bookingConflicts(existing, booking('b', 'v1', 'p1', '2027-01-01T12:00:00.000Z', '2027-01-01T13:00:00.000Z')),
    ).toEqual({
      vehicle: null,
      pilot: null,
    });
    // Editing a booking does not conflict with itself.
    expect(bookingConflicts(existing, { ...existing[0], endsAt: '2027-01-01T12:30:00.000Z' }).vehicle).toBeNull();
  });
  it('bounds booking windows', () => {
    const now = Date.parse('2027-01-01T00:00:00.000Z');
    const at = (hours: number) => new Date(now + hours * 3_600_000).toISOString();
    expect(validBookingWindow({ startsAt: at(1), endsAt: at(3) }, now)).toBe(true);
    expect(validBookingWindow({ startsAt: at(1), endsAt: at(50) }, now)).toBe(false);
    expect(validBookingWindow({ startsAt: at(-3), endsAt: at(-1) }, now)).toBe(false);
    expect(validBookingWindow({ startsAt: at(61 * 24), endsAt: at(61 * 24 + 1) }, now)).toBe(false);
  });
});

describe('N070 Landsraad observation', () => {
  const now = Date.parse('2027-01-01T00:00:00.000Z');
  it('keeps only identified objectives and reported fields', () => {
    const observation = landsraadObservation(
      {
        term: { term_id: '42nd Landsraad', end_time: '2027-01-05T00:00:00Z' },
        tasks: [
          { task_id: 7, name: 'Deliver spice  melange', completed: true, winning_faction: 'Atreides' },
          { id: 'house-ecaz', completed: false },
          { completed: false },
          { task_id: 9, sysselraad: true },
          { task_id: 7, name: 'Duplicate' },
        ],
      },
      now,
    );
    expect(observation).toEqual({
      status: 'ok',
      termId: '42nd Landsraad',
      endsAt: '2027-01-05T00:00:00.000Z',
      tasks: [
        { key: '7', label: 'Deliver spice melange', completed: true, winner: 'atreides' },
        { key: 'house-ecaz', label: 'Task house-ecaz', completed: false, winner: null },
      ],
      unidentified: 2,
      observedAt: '2027-01-01T00:00:00.000Z',
    });
  });
  it('reports unsupported and unavailable sources without inventing a term', () => {
    expect(landsraadObservation({ capabilities: { landsraad: false } }, now)).toEqual({ status: 'unsupported' });
    expect(landsraadObservation({}, now)).toEqual({ status: 'unavailable' });
    expect(landsraadObservation({ term: { term_id: 'T' } }, now)).toEqual({ status: 'unavailable' });
  });
});
