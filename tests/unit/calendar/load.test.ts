import { beforeEach, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({
  events: vi.fn(),
  profile: vi.fn(),
  guild: vi.fn(),
  member: vi.fn(),
  operations: vi.fn(),
  queue: vi.fn(),
  registration: vi.fn(),
}));
vi.mock('../../../src/features/events/server/store', () => ({ listCommunityEvents: mocks.events }));
vi.mock('../../../src/features/events/server/registrations-store', () => ({
  getEventRegistration: mocks.registration,
}));
vi.mock('../../../src/features/portal/server/load', () => ({ loadPortalProfile: mocks.profile }));
vi.mock('../../../src/features/guilds/details', () => ({ reportedGuild: mocks.guild }));
vi.mock('../../../src/features/guilds/server/member-access', () => ({ requireGuildMember: mocks.member }));
vi.mock('../../../src/features/guilds/server/operations-store', () => ({ readGuildOperations: mocks.operations }));
vi.mock('../../../src/features/monitoring/server/restart-queue', () => ({ readRestartQueue: mocks.queue }));
import { loadCalendar } from '../../../src/features/calendar/server/load';

const session = { user: { id: 'account' } } as DashboardSession;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.registration.mockResolvedValue({ ownStatus: null });
  mocks.events.mockResolvedValue([
    {
      id: 'event',
      title: 'Event',
      summary: 'Public',
      startsAt: '2026-11-16T10:00:00Z',
      endsAt: null,
      status: 'upcoming',
    },
    { id: 'unscheduled', startsAt: null },
  ]);
  mocks.profile.mockResolvedValue({ status: 'ok', profile: { character: { guild: 'guild' }, legacyCharacter: {} } });
  mocks.guild.mockReturnValue({ id: 'g1' });
  mocks.member.mockResolvedValue({ memberId: 'self' });
  mocks.operations.mockResolvedValue([
    {
      id: 'own',
      title: 'Own',
      details: 'private',
      startsAt: '2026-11-16T11:00:00Z',
      endsAt: '2026-11-16T12:00:00Z',
      status: 'scheduled',
      signups: [{ memberId: 'self' }],
    },
    {
      id: 'other',
      title: 'Other',
      details: 'hidden',
      startsAt: '2026-11-16T11:00:00Z',
      endsAt: '2026-11-16T12:00:00Z',
      status: 'scheduled',
      signups: [{ memberId: 'other' }],
    },
  ]);
  mocks.queue.mockResolvedValue({
    observedAt: Date.parse('2026-11-16T09:00:00Z'),
    entries: [
      {
        id: 'r1',
        status: 'counting',
        target: 'battlegroup',
        mapLabel: 'all',
        restartAt: Date.parse('2026-11-16T09:30:00Z'),
      },
    ],
  });
});

it('merges bounded sources and includes only the verified member’s commitments', async () => {
  const data = await loadCalendar(session);
  expect(data.items.map((item) => item.id)).toEqual(['maintenance:r1', 'event:event', 'operation:own']);
  expect(data.items.find((item) => item.id === 'event:event')?.state).toBe('unspecified');
  expect(data.unscheduledEvents).toBe(1);
  expect(JSON.stringify(data)).not.toContain('hidden');
});

it('deduplicates exact source identities and orders equal start times deterministically', async () => {
  mocks.events.mockResolvedValue([
    {
      id: 'shared',
      title: 'Event',
      summary: 'Public',
      startsAt: '2026-11-16T09:30:00Z',
      endsAt: null,
      status: 'upcoming',
    },
  ]);
  mocks.operations.mockResolvedValue([
    {
      id: 'own',
      title: 'Duplicate',
      details: 'private',
      startsAt: '2026-11-16T11:00:00Z',
      endsAt: '2026-11-16T12:00:00Z',
      status: 'scheduled',
      signups: [{ memberId: 'self' }],
    },
    {
      id: 'own',
      title: 'Duplicate',
      details: 'private',
      startsAt: '2026-11-16T11:00:00Z',
      endsAt: '2026-11-16T12:00:00Z',
      status: 'scheduled',
      signups: [{ memberId: 'self' }],
    },
  ]);
  const data = await loadCalendar(session);
  expect(data.items.map((item) => item.id)).toEqual(['maintenance:r1', 'event:shared', 'operation:own']);
});

it('hides guild records when fresh membership fails and reports partial sources', async () => {
  mocks.member.mockRejectedValue(new Error('revoked'));
  mocks.queue.mockRejectedValue(new Error('offline'));
  const data = await loadCalendar(session);
  expect(data.operationsState).toBe('unavailable');
  expect(data.maintenanceAvailable).toBe(false);
  expect(mocks.operations).not.toHaveBeenCalled();
  expect(data.items.map((item) => item.id)).toEqual(['event:event']);
});

it('keeps other sources when the restart client cannot be constructed', async () => {
  mocks.queue.mockImplementation(() => {
    throw new Error('not configured');
  });
  const data = await loadCalendar(session);
  expect(data.maintenanceAvailable).toBe(false);
  expect(data.items.map((item) => item.id)).toEqual(['event:event', 'operation:own']);
});

it('adds only the caller’s registration context and reports unreadable status', async () => {
  mocks.registration.mockResolvedValue({ ownStatus: 'waiting', ownWaitlistPosition: 3 });
  const data = await loadCalendar(session);
  expect(data.items.find((item) => item.id === 'event:event')?.description).toContain('waiting list, position 3');
  expect(data.items.find((item) => item.id === 'event:event')?.state).toBe('unspecified');
  expect(data.registrationUnavailable).toBe(0);
  mocks.registration.mockRejectedValue(new Error('offline'));
  expect((await loadCalendar(session)).registrationUnavailable).toBe(1);
});
