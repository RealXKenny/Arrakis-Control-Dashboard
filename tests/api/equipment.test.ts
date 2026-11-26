import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  collect: vi.fn(),
  readPlanner: vi.fn(),
  savePlanner: vi.fn(),
  readHistory: vi.fn(),
  append: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/features/player/server/item-finder', () => ({
  resolveItemCharacter: state.linked,
  collectInventory: state.collect,
}));
vi.mock('../../src/features/player/server/equipment-store', () => ({
  readPlanner: state.readPlanner,
  savePlanner: state.savePlanner,
  readHistory: state.readHistory,
  appendSnapshot: state.append,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
import { GET, POST } from '../../src/app/api/v2/equipment/route';
import { GET as readings } from '../../src/app/api/v2/equipment/readings/route';
import { GET as history, POST as recordHistory } from '../../src/app/api/v2/equipment/history/route';

const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const filterId = '1c7a9e2b-3d4f-4a5b-8c6d-7e8f9a0b1c2d';
const session = { user: { id: 'verified-user' }, linkedPlayerId: 'stale' };
const planner = {
  loadouts: [
    {
      id: '0b1d8f43-0d8f-4b3c-9e47-6f3c1a2b9d10',
      name: 'Spice run',
      purpose: 'harvesting',
      notes: '',
      items: [{ templateId: 'Cutteray', name: 'Cutteray', quantity: '2', minGrade: 2, minDurabilityPercent: null }],
    },
  ],
  watchlist: [{ templateId: 'Cutteray', name: 'Cutteray', thresholdPercent: 50 }],
  filters: [
    {
      id: filterId,
      name: 'Vehicle cargo',
      text: '',
      minGrade: null,
      maxGrade: null,
      kind: 'any',
      augments: 'any',
      augmentText: '',
      source: 'vehicle',
      locationText: '',
    },
  ],
  storageRules: [],
};
const observed = (patch: Record<string, unknown>) => ({
  id: 'x',
  name: 'Cutteray',
  templateId: 'Cutteray',
  quantity: '1',
  grade: '3',
  durability: '20 / 100',
  augments: [],
  location: 'Character · Backpack · inventory 1 · slot 0',
  href: '/storage',
  sourceKind: 'character',
  container: 'Character',
  containerKey: 'character',
  group: 'Backpack',
  ...patch,
});
const write = (url: string, body: unknown, origin = 'http://localhost') =>
  new Request(url, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(session);
  state.linked.mockResolvedValue({ player: '101', controller: '202' });
  state.limit.mockResolvedValue({ allowed: true });
  state.readPlanner.mockResolvedValue({ revision, planner });
  state.savePlanner.mockImplementation(async (_u, _c, _p, _r, next) => ({ revision, planner: next }));
  state.readHistory.mockResolvedValue({ revision: null, snapshots: [] });
  state.append.mockImplementation(async (_u, _c, _p, _r, snapshot) => ({
    revision,
    snapshots: snapshot ? [snapshot] : [],
  }));
  state.collect.mockResolvedValue({
    startedAt: '2026-11-26T02:00:00.000Z',
    limited: false,
    sources: [{ name: 'Character inventory', status: 'ok', detail: '', checkedAt: '2026-11-26T02:00:00.000Z' }],
    items: [
      observed({ id: 'a' }),
      observed({ id: 'b', grade: '1', sourceKind: 'vehicle', location: 'Vehicle Scout #22', group: null }),
    ],
    containers: [
      {
        key: 'vehicle:22',
        label: 'Scout cargo',
        location: 'Vehicle Scout #22',
        href: '/vehicles',
        sourceKind: 'vehicle',
        usedSlots: 1,
        maxSlots: null,
      },
    ],
  });
});

it('rejects anonymous access before resolving characters, reading plans or scanning', async () => {
  state.session.mockResolvedValue(null);
  expect((await GET(new Request('http://localhost/api/v2/equipment'))).status).toBe(401);
  expect((await readings(new Request('http://localhost/api/v2/equipment/readings'))).status).toBe(401);
  expect(state.linked).not.toHaveBeenCalled();
  expect(state.collect).not.toHaveBeenCalled();
});
it('derives plan ownership only from the verified session and fresh character link', async () => {
  const response = await GET(new Request('http://localhost/api/v2/equipment?userId=foreign&player=999'));
  expect(response.status).toBe(200);
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(state.readPlanner).toHaveBeenCalledWith('verified-user', '202', '101');
});
it('keeps same-origin, media type, bounded and strict validation on plan writes', async () => {
  const url = 'http://localhost/api/v2/equipment';
  expect((await POST(write(url, { revision, planner }, 'https://foreign.test'))).status).toBe(403);
  expect((await POST(write(url, { revision, planner, ownerId: 'foreign' }))).status).toBe(400);
  expect((await POST(write(url, { revision, planner: { ...planner, loadouts: [{}] } }))).status).toBe(400);
  expect(
    (
      await POST(
        new Request(url, {
          method: 'POST',
          headers: { origin: 'http://localhost', 'Content-Type': 'text/plain' },
          body: '{}',
        }),
      )
    ).status,
  ).toBe(415);
  expect(
    (
      await POST(
        new Request(url, {
          method: 'POST',
          headers: { origin: 'http://localhost', 'Content-Type': 'application/json' },
          body: 'x'.repeat(96 * 1024 + 1),
        }),
      )
    ).status,
  ).toBe(413);
  expect(state.savePlanner).not.toHaveBeenCalled();
  expect((await POST(write(url, { revision, planner }))).status).toBe(200);
  expect(state.savePlanner).toHaveBeenCalledWith('verified-user', '202', '101', revision, planner);
  state.savePlanner.mockRejectedValue(new AppError('Changed.', 409, 'EQUIPMENT_CONFLICT', true));
  expect((await POST(write(url, { revision, planner }))).status).toBe(409);
});
it('returns derived readiness, wear and filtered gear without planning metadata or container rows', async () => {
  const req = new Request('http://localhost/api/v2/equipment/readings');
  const body = await (await readings(req)).json();
  expect(state.collect).toHaveBeenCalledWith(session, { controller: '202', player: '101' }, req.signal);
  expect(body.readiness[0]).toMatchObject({ ready: false });
  expect(body.readiness[0].entries[0]).toMatchObject({ status: 'unsuitable', suitable: '1', unsuitable: '1' });
  expect(body.wear[0]).toMatchObject({ below: 2, unknown: 0 });
  expect(body.matches).toHaveLength(2);
  expect(body.matches[0]).not.toHaveProperty('containerKey');
  expect(body.containers).toEqual({ checked: 1, verifiedCapacity: 0 });
  expect(body.coverage).not.toHaveProperty('items');
  expect(body.coverage).not.toHaveProperty('containers');
});
it('applies only server-saved filters and rejects unknown filter IDs before scanning', async () => {
  const body = await (
    await readings(new Request(`http://localhost/api/v2/equipment/readings?filter=${filterId}`))
  ).json();
  expect(body.filter).toEqual({ id: filterId, name: 'Vehicle cargo' });
  expect(body.matches.map((item: { id: string }) => item.id)).toEqual(['b']);
  state.collect.mockClear();
  const missing = await readings(new Request('http://localhost/api/v2/equipment/readings?filter=not-saved'));
  expect(missing.status).toBe(404);
  expect(state.collect).not.toHaveBeenCalled();
});
it('shares the finder scan budget and stops before scanning when throttled', async () => {
  state.limit.mockImplementation(async (key: string) => ({ allowed: !key.startsWith('v2:item-finder:') }));
  expect((await readings(new Request('http://localhost/api/v2/equipment/readings'))).status).toBe(429);
  expect(
    (await recordHistory(write('http://localhost/api/v2/equipment/history', { revision: null, action: 'record' })))
      .status,
  ).toBe(429);
  expect(state.collect).not.toHaveBeenCalled();
});
it('fails closed on a changed or missing character link', async () => {
  state.linked.mockRejectedValue(new AppError('Link a character.', 403, 'UNLINKED', true));
  expect((await GET(new Request('http://localhost/api/v2/equipment'))).status).toBe(403);
  expect((await history(new Request('http://localhost/api/v2/equipment/history'))).status).toBe(403);
  expect(state.readPlanner).not.toHaveBeenCalled();
  expect(state.readHistory).not.toHaveBeenCalled();
});
it('records aggregate snapshots without locations and refuses stale revisions before scanning', async () => {
  const url = 'http://localhost/api/v2/equipment/history';
  const response = await recordHistory(write(url, { revision: null, action: 'record' }));
  expect(response.status).toBe(200);
  const [, , , expected, snapshot] = state.append.mock.calls[0];
  expect(expected).toBeNull();
  expect(snapshot.totals).toEqual([{ templateId: 'Cutteray', name: 'Cutteray', quantity: '2', exact: true }]);
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain('Vehicle Scout');
  expect(body.snapshots[0]).toMatchObject({ templates: 1, complete: true });
  state.collect.mockClear();
  expect((await recordHistory(write(url, { revision, action: 'record' }))).status).toBe(409);
  expect(state.collect).not.toHaveBeenCalled();
  expect((await recordHistory(write(url, { revision: null, action: 'clear' }))).status).toBe(200);
  expect(state.append).toHaveBeenLastCalledWith('verified-user', '202', '101', null, null);
  expect((await recordHistory(write(url, { revision: null, action: 'delete-all' }))).status).toBe(400);
  expect((await recordHistory(write(url, { revision: null, action: 'clear' }, 'https://foreign.test'))).status).toBe(
    403,
  );
});
