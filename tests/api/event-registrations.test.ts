import { beforeEach, expect, it, vi } from 'vitest';
import { firstCommunityEvent } from '../../src/features/events/contracts';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  mutate: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/events/server/store', () => ({ listCommunityEvents: mocks.list }));
vi.mock('../../src/features/events/server/registrations-store', () => ({
  getEventRegistration: mocks.get,
  mutateEventRegistration: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL', APP_URL: 'https://dashboard.test' }),
}));

import { GET, POST } from '../../src/app/api/v2/events/[eventId]/registration/route';

const event = firstCommunityEvent();
const registration = {
  revision: null,
  capacity: 100,
  waitlistCapacity: 100,
  registered: 1,
  waiting: 0,
  ownStatus: 'registered',
  ownWaitlistPosition: null,
  state: 'open',
  canRegister: false,
  canCancel: true,
};
const session = {
  user: { id: 'member' },
  guildId: 'guild',
  roleIds: ['member'],
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};
const context = { params: Promise.resolve({ eventId: event.id }) };
const request = (origin = 'https://dashboard.test') =>
  new Request(`https://dashboard.test/api/v2/events/${event.id}/registration`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', revision: null }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.list.mockResolvedValue([event]);
  mocks.get.mockResolvedValue(registration);
  mocks.mutate.mockResolvedValue(registration);
  mocks.limit.mockResolvedValue({ allowed: true, storageUnavailable: false });
});

it('requires a session and rejects cross-origin mutations before changing registration', async () => {
  mocks.session.mockResolvedValue(null);
  expect((await GET(new Request('https://dashboard.test'), context)).status).toBe(401);
  mocks.session.mockResolvedValue(session);
  expect((await POST(request('https://attacker.test'), context)).status).toBe(403);
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it('uses only the session owner and returns the caller-relative summary', async () => {
  const response = await POST(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(mocks.mutate).toHaveBeenCalledWith(event, { action: 'register', revision: null }, 'member');
  expect(await response.json()).toEqual({ ok: true, registration });
});

it('fails closed when request protection storage is unavailable', async () => {
  mocks.limit.mockResolvedValue({ allowed: true, storageUnavailable: true });
  expect((await GET(new Request('https://dashboard.test'), context)).status).toBe(503);
  expect(mocks.get).not.toHaveBeenCalled();
});
