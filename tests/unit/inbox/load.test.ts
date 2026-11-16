import { beforeEach, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';
import { firstCommunityEvent } from '../../../src/features/events/contracts';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  events: vi.fn(),
  queue: vi.fn(),
  member: vi.fn(),
  operations: vi.fn(),
  resources: vi.fn(),
}));
vi.mock('../../../src/features/portal/server/load', () => ({ loadPortalProfile: mocks.profile }));
vi.mock('../../../src/features/events/server/store', () => ({ listCommunityEvents: mocks.events }));
vi.mock('../../../src/features/monitoring/server/restart-queue', () => ({ readRestartQueue: mocks.queue }));
vi.mock('../../../src/features/guilds/server/member-access', () => ({ requireGuildMember: mocks.member }));
vi.mock('../../../src/features/guilds/server/operations-store', () => ({ readGuildOperations: mocks.operations }));
vi.mock('../../../src/features/guilds/server/resource-requests-store', () => ({
  readResourceRequests: mocks.resources,
}));

import { loadInbox } from '../../../src/features/inbox/server/load';

const session = { user: { id: 'account' } } as DashboardSession;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ status: 'unlinked' });
  mocks.events.mockResolvedValue([
    {
      ...firstCommunityEvent(),
      id: 'event',
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
    },
  ]);
  mocks.queue.mockResolvedValue({
    observedAt: Date.now(),
    entries: [
      {
        id: 'restart',
        status: 'counting',
        target: 'map',
        mapLabel: 'Hagga Basin',
        restartAt: Date.now() + 3600000,
      },
    ],
  });
});

it('keeps public event and maintenance alerts independent of private character sources', async () => {
  const data = await loadInbox(session);
  expect(data.sources).toHaveLength(6);
  expect(data.alerts.map((alert) => alert.category).sort()).toEqual(['events', 'maintenance']);
  expect(data.sources.find((source) => source.category === 'assets')?.status).toBe('unlinked');
  expect(data.sources.find((source) => source.category === 'events')?.status).toBe('checked');
  expect(data.sources.find((source) => source.category === 'maintenance')?.status).toBe('checked');
  expect(mocks.member).not.toHaveBeenCalled();
});

it('reports independent public source failures as unavailable rather than empty', async () => {
  mocks.events.mockRejectedValue(new Error('offline'));
  mocks.queue.mockRejectedValue(new Error('offline'));
  const data = await loadInbox(session);
  expect(data.alerts).toEqual([]);
  expect(data.sources.find((source) => source.category === 'events')?.status).toBe('unavailable');
  expect(data.sources.find((source) => source.category === 'maintenance')?.status).toBe('unavailable');
});
