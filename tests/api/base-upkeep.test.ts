import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { emptyUpkeep } from '../../src/features/upkeep/model';
const state = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  linked: vi.fn(),
  collect: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  containers: vi.fn(),
  profile: vi.fn(),
  record: vi.fn(),
  samples: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/features/player/server/item-finder', () => ({
  resolveItemCharacter: state.linked,
  collectBaseItems: state.collect,
}));
vi.mock('../../src/features/upkeep/server/store', () => ({ readUpkeep: state.read, mutateUpkeep: state.mutate }));
vi.mock('../../src/features/upkeep/server/base-access', () => ({ listBaseContainers: state.containers }));
vi.mock('../../src/features/upkeep/server/water-samples', () => ({
  recordWaterSample: state.record,
  readWaterSamples: state.samples,
}));
vi.mock('../../src/features/portal/server/load', () => ({ loadPortalProfile: state.profile }));
import { GET, POST } from '../../src/app/api/v2/upkeep/route';
import { GET as overview } from '../../src/app/api/v2/upkeep/overview/route';
import { GET as stockpile } from '../../src/app/api/v2/upkeep/stockpile/route';
import { GET as containers } from '../../src/app/api/v2/upkeep/containers/route';
import { POST as blueprints } from '../../src/app/api/v2/upkeep/blueprints/route';
import { buildPortalProfile } from '../../src/features/portal/view-model';

const session = { user: { id: 'verified-user' } };
const owner = { userId: 'verified-user', controller: '202', player: '101' };
const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const post = (url: string, body: unknown, origin = 'http://localhost') =>
  new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const profile = () =>
  buildPortalProfile({
    linked: true,
    details: {
      bases: {
        rows: [
          { id: '11', name: 'Home', relationship: 'owner', water: { percent: 5 }, generatorRuntimeSeconds: 3600 },
          { id: '12', name: 'Outpost', relationship: 'shared', water: {} },
          { name: 'No identifier', relationship: 'owner' },
        ],
      },
    },
  });
const settings = {
  baseId: '11',
  waterAlertPercent: 20,
  generatorAlertHours: null,
  inspectEveryDays: null,
  minimums: [{ templateId: 'Water', name: 'Water', minimum: '10' }],
  checklist: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(session);
  state.limit.mockResolvedValue({ allowed: true });
  state.linked.mockResolvedValue({ player: '101', controller: '202' });
  state.read.mockResolvedValue({
    ...emptyUpkeep(),
    revision,
    bases: [{ ...settings, inspections: [], updatedAt: '2026-11-26T00:00:00.000Z' }],
  });
  state.mutate.mockImplementation(async () => ({ ...emptyUpkeep(), revision }));
  state.profile.mockResolvedValue({ status: 'ok', capturedAt: '2026-11-26T01:00:00.000Z', profile: profile() });
  state.record.mockResolvedValue(true);
  state.samples.mockResolvedValue([{ t: '2026-11-26T01:00:00.000Z', percent: 5 }]);
  state.containers.mockResolvedValue({ baseId: '11', containers: [{ containerId: '33', name: 'Chest' }], omitted: 0 });
});

it('requires a session and fails closed on unavailable rate limiting before any character or plan read', async () => {
  state.session.mockResolvedValueOnce(null);
  expect((await GET(new Request('http://localhost/api/v2/upkeep'))).status).toBe(401);
  state.limit.mockResolvedValueOnce({ allowed: true, storageUnavailable: true });
  expect((await GET(new Request('http://localhost/api/v2/upkeep'))).status).toBe(503);
  state.limit.mockResolvedValueOnce({ allowed: false });
  expect((await overview(new Request('http://localhost/api/v2/upkeep/overview'))).status).toBe(429);
  expect(state.linked).not.toHaveBeenCalled();
  expect(state.read).not.toHaveBeenCalled();
});

it('derives the plan owner from the session and fresh link only, with no-store responses', async () => {
  const response = await GET(new Request('http://localhost/api/v2/upkeep?userId=foreign&player=999'));
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(state.read).toHaveBeenCalledWith(owner);
  state.linked.mockRejectedValueOnce(new AppError('Link a character.', 403, 'UNLINKED', true));
  expect((await GET(new Request('http://localhost/api/v2/upkeep'))).status).toBe(403);
});

it('keeps same-origin, JSON, size and strict validation on mutations', async () => {
  const body = { action: 'base', revision, base: settings };
  expect((await POST(post('/api/v2/upkeep', body, 'https://foreign.test'))).status).toBe(403);
  expect((await POST(post('/api/v2/upkeep', { ...body, owner: 'foreign' }))).status).toBe(400);
  expect((await POST(post('/api/v2/upkeep', 'x'.repeat(16 * 1024 + 1)))).status).toBe(413);
  expect(
    (
      await POST(
        new Request('http://localhost/api/v2/upkeep', {
          method: 'POST',
          headers: { origin: 'http://localhost', 'Content-Type': 'text/plain' },
          body: '{}',
        }),
      )
    ).status,
  ).toBe(415);
  expect(state.mutate).not.toHaveBeenCalled();
  expect((await POST(post('/api/v2/upkeep', body))).status).toBe(200);
  expect(state.mutate).toHaveBeenCalledWith(owner, revision, expect.objectContaining({ action: 'base' }));
});

it('only plans for bases in the current authorised profile and only labels openable containers', async () => {
  const foreign = { action: 'base', revision, base: { ...settings, baseId: '99' } };
  expect((await POST(post('/api/v2/upkeep', foreign))).status).toBe(403);
  const reminder = {
    action: 'reminder',
    revision,
    reminder: {
      id: revision,
      title: 'Refuel',
      baseId: '99',
      everyDays: 1,
      firstDueAt: '2026-11-26T00:00:00.000Z',
      notes: '',
    },
  };
  expect((await POST(post('/api/v2/upkeep', reminder))).status).toBe(403);
  state.profile.mockResolvedValueOnce({ status: 'unavailable', message: 'down' });
  expect((await POST(post('/api/v2/upkeep', { action: 'base', revision, base: settings }))).status).toBe(503);
  const label = {
    action: 'container',
    revision,
    label: { baseId: '11', containerId: '34', alias: 'Vault', zone: 'Other' },
  };
  expect((await POST(post('/api/v2/upkeep', label))).status).toBe(403);
  expect(state.containers).toHaveBeenCalledWith(
    '11',
    { userId: 'verified-user', controller: '202', player: '101' },
    expect.anything(),
  );
  expect(state.mutate).not.toHaveBeenCalled();
  label.label.containerId = '33';
  expect((await POST(post('/api/v2/upkeep', label))).status).toBe(200);
  // Removing your own plan never needs fresh asset access.
  expect((await POST(post('/api/v2/upkeep', { action: 'base-remove', revision, baseId: '99' }))).status).toBe(200);
});

it('reports conflicts without retrying', async () => {
  state.mutate.mockRejectedValueOnce(new AppError('Changed.', 409, 'UPKEEP_CONFLICT', true));
  expect((await POST(post('/api/v2/upkeep', { action: 'base-remove', revision, baseId: '11' }))).status).toBe(409);
  expect(state.mutate).toHaveBeenCalledTimes(1);
});

it('builds the care inbox from reported readings and records observed water samples', async () => {
  const body = await (await overview(new Request('http://localhost/api/v2/upkeep/overview'))).json();
  expect(body.status).toBe('ok');
  expect(body.bases.map((base: { id: string }) => base.id)).toEqual(['11', '12']);
  expect(body.unsupported).toBe(1);
  expect(body.bases[1].generatorSeconds).toBeNull();
  const kinds = body.items.map((item: { kind: string; baseId: string }) => `${item.kind}:${item.baseId}`);
  expect(kinds).toEqual(expect.arrayContaining(['water:11', 'generator:11', 'unknown:12']));
  expect(kinds).not.toContain('generator:12');
  expect(state.record).toHaveBeenCalledWith(owner, '11', 5, Date.parse('2026-11-26T01:00:00.000Z'));
  expect(state.record).toHaveBeenCalledWith(owner, '12', null, expect.any(Number));
  state.samples.mockResolvedValueOnce(null);
  const partial = await (await overview(new Request('http://localhost/api/v2/upkeep/overview'))).json();
  expect(partial.water[0]).toEqual({ baseId: '11', samples: null, analysis: null });
});

it('returns explicit unlinked or unavailable states without base data', async () => {
  state.profile.mockResolvedValueOnce({ status: 'unlinked', message: null });
  const body = await (await overview(new Request('http://localhost/api/v2/upkeep/overview'))).json();
  expect(body).toMatchObject({ status: 'unlinked' });
  expect(body.bases).toBeUndefined();
  expect(state.record).not.toHaveBeenCalled();
});

it('checks stockpiles for one saved base under the shared search limit and returns no item rows', async () => {
  state.collect.mockResolvedValue({
    items: [{ templateId: 'water', quantity: '4', location: 'private' }],
    sources: [{ name: 'Base', status: 'ok' }],
    limited: false,
    startedAt: 'now',
  });
  const req = new Request('http://localhost/api/v2/upkeep/stockpile?base=11');
  const body = await (await stockpile(req)).json();
  expect(body.lines[0]).toMatchObject({ status: 'below', shortfall: '6' });
  expect(JSON.stringify(body)).not.toContain('private');
  expect(state.collect).toHaveBeenCalledWith(session, '11', ['Water'], owner, req.signal);
  expect(state.limit).toHaveBeenCalledWith('v2:item-finder:verified-user', { limit: 6, windowMs: 60_000 });
  expect((await stockpile(new Request('http://localhost/api/v2/upkeep/stockpile?base=x'))).status).toBe(400);
  state.collect.mockClear();
  expect(
    (await (await stockpile(new Request('http://localhost/api/v2/upkeep/stockpile?base=12'))).json()).lines,
  ).toEqual([]);
  expect(state.collect).not.toHaveBeenCalled();
});

it('lists containers through the verified owner only', async () => {
  expect((await containers(new Request('http://localhost/api/v2/upkeep/containers?base=11'))).status).toBe(200);
  expect(state.containers).toHaveBeenCalledWith(
    '11',
    expect.objectContaining({ controller: '202' }),
    expect.anything(),
  );
  expect((await containers(new Request('http://localhost/api/v2/upkeep/containers?base=../x'))).status).toBe(400);
});

it('summarises uploaded blueprints server-side and rejects invalid layouts', async () => {
  const blueprint = { id: revision, design: 'Home', label: 'v2', description: '' };
  const layout = JSON.stringify({
    instances: [{ instance_id: 1, building_type: 'BP_Wall', x: 0, y: 0, z: 0, rotation: 0 }],
  });
  expect((await blueprints(post('/api/v2/upkeep/blueprints', { revision, blueprint, layout }))).status).toBe(200);
  const action = state.mutate.mock.calls[0][2];
  expect(action).toMatchObject({ action: 'blueprint-add', blueprint: { summary: { pieces: 1 } } });
  expect(JSON.stringify(action)).not.toContain('instance_id');
  const bad = await blueprints(post('/api/v2/upkeep/blueprints', { revision, blueprint, layout: '{"instances":[]}' }));
  expect(bad.status).toBe(400);
  expect(
    (await blueprints(post('/api/v2/upkeep/blueprints', { revision, blueprint, layout }, 'https://x.test'))).status,
  ).toBe(403);
});
