import { z } from 'zod';
import type { CommunityEvent } from './contracts';

export const EVENT_ATTENDEE_LIMIT = 100;
export const EVENT_WAITLIST_LIMIT = 100;
export const eventRegistrationEntrySchema = z.object({
  status: z.enum(['registered', 'waiting']),
  joinedAt: z.iso.datetime(),
});
export type EventRegistrationEntry = z.infer<typeof eventRegistrationEntrySchema>;
export type EventRegistrationRecord = {
  revision: string | null;
  entries: Array<{ owner: string; status: EventRegistrationEntry['status']; joinedAt: string }>;
};
export const eventRegistrationInputSchema = z
  .object({
    action: z.enum(['register', 'cancel']),
    revision: z.uuid().nullable(),
  })
  .strict();
export type EventRegistrationInput = z.infer<typeof eventRegistrationInputSchema>;
export const eventRegistrationSummarySchema = z
  .object({
    revision: z.uuid().nullable(),
    capacity: z.literal(EVENT_ATTENDEE_LIMIT),
    waitlistCapacity: z.literal(EVENT_WAITLIST_LIMIT),
    registered: z.number().int().min(0).max(EVENT_ATTENDEE_LIMIT),
    waiting: z.number().int().min(0).max(EVENT_WAITLIST_LIMIT),
    ownStatus: z.enum(['registered', 'waiting']).nullable(),
    ownWaitlistPosition: z.number().int().min(1).max(EVENT_WAITLIST_LIMIT).nullable(),
    state: z.enum(['open', 'waiting-list', 'closed']),
    canRegister: z.boolean(),
    canCancel: z.boolean(),
  })
  .strict();
export type EventRegistrationSummary = z.infer<typeof eventRegistrationSummarySchema>;

export function eventRegistrationOpen(event: CommunityEvent, now: number): boolean {
  return Boolean(
    event.visibility === 'published' &&
    ['upcoming', 'open'].includes(event.status) &&
    event.startsAt &&
    Date.parse(event.startsAt) > now &&
    (!event.endsAt || Date.parse(event.endsAt) > now),
  );
}

export function eventRegistrationSummary(
  event: CommunityEvent,
  record: EventRegistrationRecord,
  owner: string,
  now = Date.now(),
): EventRegistrationSummary {
  const registered = record.entries.filter((entry) => entry.status === 'registered').length;
  const waiting = record.entries
    .filter((entry) => entry.status === 'waiting')
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.owner.localeCompare(b.owner));
  const own = record.entries.find((entry) => entry.owner === owner) ?? null;
  const open = eventRegistrationOpen(event, now);
  return {
    revision: record.revision,
    capacity: EVENT_ATTENDEE_LIMIT,
    waitlistCapacity: EVENT_WAITLIST_LIMIT,
    registered,
    waiting: waiting.length,
    ownStatus: own?.status ?? null,
    ownWaitlistPosition: own?.status === 'waiting' ? waiting.findIndex((entry) => entry.owner === owner) + 1 : null,
    state: !open ? 'closed' : registered >= EVENT_ATTENDEE_LIMIT ? 'waiting-list' : 'open',
    canRegister: open && !own && waiting.length < EVENT_WAITLIST_LIMIT,
    canCancel: Boolean(own),
  };
}
