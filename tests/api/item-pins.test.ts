import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  collect: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/player/server/item-finder', () => ({
  resolveItemCharacter: state.linked,
  collectPinnedItems: state.collect,
}));
vi.mock('../../src/features/player/server/item-pins-store', () => ({
  readItemPins: state.read,
  saveItemPins: state.save,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET, POST } from '../../src/app/api/v2/items/pins/route';
import { GET as readings } from '../../src/app/api/v2/items/pins/readings/route';
const pin = { templateId: 'Spice', name: 'Spice Melange' };
const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const session = { user: { id: 'verified-user' }, linkedPlayerId: 'stale' };
const request = (body: unknown, origin = 'http://localhost') =>
  new Request('http://localhost/api/v2/items/pins', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(session);
  state.linked.mockResolvedValue({ player: '101', controller: '202' });
  state.limit.mockResolvedValue({ allowed: true });
  state.read.mockResolvedValue({ revision, pins: [pin] });
  state.save.mockResolvedValue({ revision, pins: [pin] });
  state.collect.mockResolvedValue({
    items: [{ templateId: 'spice', quantity: '9007199254740993' }],
    sources: [{ name: 'Backpack', status: 'ok' }],
    startedAt: '2026-11-11T04:00:00Z',
    limited: false,
  });
});
it('rejects anonymous access before resolving characters or reading pins', async () => {
  state.session.mockResolvedValue(null);
  expect((await GET(new Request('http://localhost/api/v2/items/pins'))).status).toBe(401);
  expect(state.linked).not.toHaveBeenCalled();
  expect(state.read).not.toHaveBeenCalled();
});
it('derives both preference owners from the verified session and fresh link, ignoring caller IDs', async () => {
  const response = await GET(new Request('http://localhost/api/v2/items/pins?userId=foreign&controller=999'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(state.read).toHaveBeenCalledWith('verified-user', '202', '101');
});
it('keeps same-origin and bounded strict JSON validation on mutations', async () => {
  expect((await POST(request({ revision, pins: [pin] }, 'https://foreign.test'))).status).toBe(403);
  expect((await POST(request({ revision, pins: [pin], ownerId: 'foreign' }))).status).toBe(400);
  expect((await POST(request({ revision: 'bad', pins: [pin] }))).status).toBe(400);
  expect(
    (
      await POST(
        new Request('http://localhost/api/v2/items/pins', {
          method: 'POST',
          headers: { origin: 'http://localhost', 'Content-Type': 'application/json' },
          body: 'x'.repeat(8193),
        }),
      )
    ).status,
  ).toBe(413);
  expect(state.save).not.toHaveBeenCalled();
});
it('saves the current character record only and reports conflicts without retry', async () => {
  expect((await POST(request({ revision, pins: [pin] }))).status).toBe(200);
  expect(state.save).toHaveBeenCalledWith('verified-user', '202', '101', revision, [pin]);
  state.save.mockRejectedValue(new AppError('Pins changed.', 409, 'PIN_CONFLICT', true));
  expect((await POST(request({ revision, pins: [] }))).status).toBe(409);
  expect(state.save).toHaveBeenCalledTimes(2);
});
it('returns counters only from verified source observations and propagates controller/cancellation guards', async () => {
  const req = new Request('http://localhost/api/v2/items/pins/readings?playerId=foreign');
  const response = await readings(req);
  const body = await response.json();
  expect(body.counters[0]).toMatchObject({ quantity: '9007199254740993', complete: true });
  expect(body.items).toBeUndefined();
  expect(body.coverage.items).toBeUndefined();
  expect(state.collect).toHaveBeenCalledWith(session, ['Spice'], { controller: '202', player: '101' }, req.signal);
});
it('keeps partial zeros incomplete and stops before scanning when throttled', async () => {
  state.collect.mockResolvedValue({
    items: [],
    sources: [{ status: 'unavailable' }],
    limited: false,
    startedAt: 'now',
  });
  expect(
    (await (await readings(new Request('http://localhost/api/v2/items/pins/readings'))).json()).counters[0],
  ).toMatchObject({ quantity: '0', complete: false });
  state.limit.mockResolvedValue({ allowed: false });
  state.collect.mockClear();
  expect((await readings(new Request('http://localhost/api/v2/items/pins/readings'))).status).toBe(429);
  expect(state.collect).not.toHaveBeenCalled();
});
it('fails closed on a changed or missing link and never reads a former character record', async () => {
  state.linked.mockRejectedValue(new AppError('Link a character.', 403, 'UNLINKED', true));
  expect((await GET(new Request('http://localhost/api/v2/items/pins'))).status).toBe(403);
  expect(state.read).not.toHaveBeenCalled();
});
