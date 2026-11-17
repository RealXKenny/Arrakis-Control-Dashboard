import { expect, it } from 'vitest';
import { firstCommunityEvent } from '../../../src/features/events/contracts';
import {
  EVENT_ATTENDEE_LIMIT,
  EVENT_WAITLIST_LIMIT,
  eventRegistrationSummary,
  type EventRegistrationRecord,
} from '../../../src/features/events/registrations';

const now = Date.parse('2026-11-16T00:00:00Z');
const event = {
  ...firstCommunityEvent(),
  startsAt: new Date(now + 3600000).toISOString(),
  endsAt: new Date(now + 7200000).toISOString(),
  status: 'open' as const,
};

it('projects only aggregate attendance and the caller’s own status and waiting position', () => {
  const record: EventRegistrationRecord = {
    revision: crypto.randomUUID(),
    entries: [
      { owner: 'private-a', status: 'waiting', joinedAt: '2026-11-15T00:00:00Z' },
      { owner: 'private-b', status: 'registered', joinedAt: '2026-11-15T00:00:00Z' },
      { owner: 'private-c', status: 'waiting', joinedAt: '2026-11-15T00:01:00Z' },
    ],
  };
  const own = eventRegistrationSummary(event, record, 'private-c', now);
  expect(own).toMatchObject({ registered: 1, waiting: 2, ownStatus: 'waiting', ownWaitlistPosition: 2 });
  expect(own.canCancel).toBe(true);
  expect(JSON.stringify(own)).not.toMatch(/private-[abc]/);
  const other = eventRegistrationSummary(event, record, 'other', now);
  expect(other.ownStatus).toBeNull();
  expect(other.canRegister).toBe(true);
});

it('uses bounded capacities and closes registration at the start or event cancellation', () => {
  const entries: EventRegistrationRecord['entries'] = [];
  for (let index = 0; index < EVENT_ATTENDEE_LIMIT; index++)
    entries.push({ owner: `seat-${index}`, status: 'registered', joinedAt: '2026-11-15T00:00:00Z' });
  for (let index = 0; index < EVENT_WAITLIST_LIMIT; index++)
    entries.push({ owner: `wait-${index}`, status: 'waiting', joinedAt: '2026-11-15T00:00:00Z' });
  const full = eventRegistrationSummary(event, { revision: null, entries }, 'new-owner', now);
  expect(full.state).toBe('waiting-list');
  expect(full.canRegister).toBe(false);
  expect(eventRegistrationSummary(event, { revision: null, entries: [] }, 'owner', now + 3600000).state).toBe('closed');
  expect(
    eventRegistrationSummary({ ...event, status: 'cancelled' }, { revision: null, entries: [] }, 'owner', now)
      .canRegister,
  ).toBe(false);
});
