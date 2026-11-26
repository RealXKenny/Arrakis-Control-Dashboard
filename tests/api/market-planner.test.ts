import { beforeEach, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { emptyPlanner } from '../../src/features/market/planner';

const state = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  budget: vi.fn(),
  linked: vi.fn(),
  collect: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  searches: vi.fn(),
  clear: vi.fn(),
  alerts: vi.fn(),
  writeAlerts: vi.fn(),
  prices: vi.fn(),
  ladders: vi.fn(),
  trades: vi.fn(),
  console: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: state.session }));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: state.budget }));
vi.mock('../../src/server/integrations/dune', () => ({
  getDuneClient: () => ({ request: state.console }),
  DuneConsoleApiError: class extends Error {},
}));
vi.mock('../../src/features/player/server/item-finder', () => ({
  resolveItemCharacter: state.linked,
  collectPinnedItems: state.collect,
}));
vi.mock('../../src/features/market/server/planner-store', () => ({
  PRICE_SAMPLE_INTERVAL_MS: 600_000,
  readPlanner: state.read,
  savePlanner: state.save,
  readSearches: state.searches,
  clearSearches: state.clear,
  readAlertStates: state.alerts,
  writeAlertStates: state.writeAlerts,
  readPricePoints: state.prices,
}));
vi.mock('../../src/features/market/server/price-ladder', () => ({
  ladderKey: (templateId: string, grade?: number | null) => `${templateId.toLowerCase()}:${grade ?? '*'}`,
  readLadders: state.ladders,
}));
vi.mock('../../src/features/market/server/transactions', () => ({ readTrades: state.trades }));

import { GET as getPlanner, POST as postPlanner } from '../../src/app/api/v2/market/planner/route';
import { GET as getReadings } from '../../src/app/api/v2/market/planner/readings/route';
import { GET as getPrices } from '../../src/app/api/v2/market/planner/prices/route';
import { DELETE as deleteSearches } from '../../src/app/api/v2/market/planner/searches/route';
import { GET as getProject } from '../../src/app/api/v2/market/planner/projects/[id]/route';
import { GET as getActivity } from '../../src/app/api/v2/market/activity/route';
import { GET as getSales } from '../../src/app/api/v2/market/sales/route';

const revision = '07acb5b6-58f3-4c18-b4b7-dbe8ed748b21';
const watchId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const session = { user: { id: 'verified-user' } };
const planner = {
  ...emptyPlanner(),
  watches: [
    {
      id: watchId,
      templateId: 'Water',
      name: 'Water',
      grade: null,
      below: '20',
      above: null,
      cooldownMinutes: 60,
    },
  ],
  basket: [{ templateId: 'Water', name: 'Water', grade: null, quantity: '4' }],
  budget: '100',
  projects: [
    {
      id: projectId,
      name: 'Workshop',
      materials: [{ templateId: 'Water', name: 'Water', quantity: '10' }],
    },
  ],
};
const ladder = {
  status: 'ok',
  orders: [
    { price: '10', stock: '3', party: 'player' },
    { price: '12', stock: '5', party: 'broker' },
  ],
  rejected: 0,
  truncated: false,
  readAt: '2026-11-26T01:00:00.000Z',
};
const url = (path: string) => `http://localhost${path}`;
const post = (body: unknown, origin = 'http://localhost') =>
  new Request(url('/api/v2/market/planner'), {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue(session);
  state.limit.mockResolvedValue({ allowed: true });
  state.budget.mockResolvedValue({ allowed: true });
  state.linked.mockResolvedValue({ player: '101', controller: '202' });
  state.read.mockResolvedValue({ revision, planner });
  state.save.mockImplementation(async (_user, _revision, value) => ({ revision, planner: value }));
  state.searches.mockResolvedValue(['spice']);
  state.alerts.mockResolvedValue({});
  state.writeAlerts.mockResolvedValue(true);
  state.ladders.mockResolvedValue(new Map([['water:*', ladder]]));
  state.console.mockResolvedValue({ rows: [{ currency_id: 0, balance: '9007199254740993' }] });
});

it('rejects anonymous access before reading any planner data', async () => {
  state.session.mockResolvedValue(null);
  for (const response of [
    await getPlanner(new Request(url('/api/v2/market/planner'))),
    await getReadings(new Request(url('/api/v2/market/planner/readings'))),
    await getSales(new Request(url('/api/v2/market/sales'))),
    await getActivity(new Request(url('/api/v2/market/activity'))),
  ])
    expect(response.status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
  expect(state.trades).not.toHaveBeenCalled();
});

it('derives the planner owner from the session and ignores caller IDs', async () => {
  const response = await getPlanner(new Request(url('/api/v2/market/planner?userId=foreign')));
  expect(response.headers.get('Cache-Control')).toBe('no-store');
  expect(await response.json()).toMatchObject({ revision, searches: ['spice'] });
  expect(state.read).toHaveBeenCalledWith('verified-user');
  state.searches.mockRejectedValue(new Error('down'));
  expect((await (await getPlanner(new Request(url('/api/v2/market/planner')))).json()).searches).toBeNull();
});

it('keeps same-origin, media type, size and strict schema checks on saves', async () => {
  expect((await postPlanner(post({ revision, planner }, 'https://foreign.test'))).status).toBe(403);
  expect((await postPlanner(post({ revision, planner, ownerId: 'x' }))).status).toBe(400);
  expect((await postPlanner(post({ revision: 'bad', planner }))).status).toBe(400);
  expect((await postPlanner(post('x'.repeat(16_385)))).status).toBe(413);
  const inverted = { ...planner, watches: [{ ...planner.watches[0], above: '10' }] };
  const rejected = await postPlanner(post({ revision, planner: inverted }));
  expect(rejected.status).toBe(400);
  expect((await rejected.json()).error).toMatch(/low threshold/);
  expect(state.save).not.toHaveBeenCalled();
  expect((await postPlanner(post({ revision, planner }))).status).toBe(200);
  expect(state.save).toHaveBeenCalledWith('verified-user', revision, planner);
  state.save.mockRejectedValue(new AppError('changed', 409, 'PLANNER_CONFLICT', true));
  expect((await postPlanner(post({ revision, planner }))).status).toBe(409);
  expect(state.save).toHaveBeenCalledTimes(2);
});

it('clears search history only for same-origin requests', async () => {
  const request = (origin: string) =>
    new Request(url('/api/v2/market/planner/searches'), { method: 'DELETE', headers: { origin } });
  expect((await deleteSearches(request('https://foreign.test'))).status).toBe(403);
  expect((await deleteSearches(request('http://localhost'))).status).toBe(200);
  expect(state.clear).toHaveBeenCalledWith('verified-user');
});

it('returns alerts, estimates, party comparison and a read-only balance without seller data', async () => {
  const response = await getReadings(new Request(url('/api/v2/market/planner/readings')));
  const body = await response.json();
  expect(body.watches[0]).toMatchObject({
    id: watchId,
    alert: { condition: 'below', notify: true },
    ladder: { status: 'ok', summary: { lowest: '10', player: { lowest: '10' }, broker: { lowest: '12' } } },
  });
  expect(body.basket[0].estimate).toEqual({ quantity: '4', cost: '42', filled: '4', shortfall: '0' });
  expect(body.budget).toMatchObject({
    estimate: '42',
    balance: '9007199254740993',
    balanceStatus: 'within',
    budgetStatus: 'within',
  });
  expect(state.console).toHaveBeenCalledWith('GET', '/api/players/101/currency', expect.anything());
  expect(state.console.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  expect(state.writeAlerts).toHaveBeenCalledWith('verified-user', {
    [watchId]: { condition: 'below', notifiedAt: expect.any(String) },
  });
  expect(JSON.stringify(body)).not.toMatch(/owner_id|sellerId/);
});

it('reports unknown rather than within range when a ladder is incomplete or the balance is unreadable', async () => {
  state.ladders.mockResolvedValue(new Map([['water:*', { ...ladder, truncated: true }]]));
  state.console.mockResolvedValue({ rows: [] });
  const body = await (await getReadings(new Request(url('/api/v2/market/planner/readings')))).json();
  expect(body.watches[0].alert).toMatchObject({ condition: 'unknown', notify: false });
  expect(body.basket[0].estimate).toBeNull();
  expect(body.budget).toMatchObject({ balance: null, balanceStatus: 'unknown', estimateComplete: false });
  state.linked.mockRejectedValue(new AppError('Link first', 403, 'UNLINKED', true));
  const unlinked = await (await getReadings(new Request(url('/api/v2/market/planner/readings')))).json();
  expect(unlinked.balance).toEqual({ status: 'unlinked' });
});

it('stops before upstream reads when throttled', async () => {
  state.limit.mockResolvedValue({ allowed: false });
  expect((await getReadings(new Request(url('/api/v2/market/planner/readings')))).status).toBe(429);
  expect(state.ladders).not.toHaveBeenCalled();
  state.limit.mockResolvedValue({ allowed: true });
  state.budget.mockResolvedValue({ allowed: false });
  expect((await getActivity(new Request(url('/api/v2/market/activity')))).status).toBe(429);
  expect(state.trades).not.toHaveBeenCalled();
});

it('validates observed price queries', async () => {
  state.prices.mockResolvedValue({ points: [], rejected: 0 });
  expect((await getPrices(new Request(url('/api/v2/market/planner/prices?templateId=a%20b')))).status).toBe(400);
  expect((await getPrices(new Request(url('/api/v2/market/planner/prices?templateId=Water&grade=123')))).status).toBe(
    400,
  );
  const ok = await getPrices(new Request(url('/api/v2/market/planner/prices?templateId=Water&grade=2')));
  expect(await ok.json()).toEqual({ points: [], rejected: 0, sampleIntervalMs: 600_000 });
  expect(state.prices).toHaveBeenCalledWith('Water', 2);
});

it('compares a saved project with fresh authorized storage only', async () => {
  state.collect.mockResolvedValue({
    items: [{ templateId: 'water', quantity: '6' }],
    sources: [{ name: 'Backpack', status: 'ok' }],
    limited: false,
    startedAt: '2026-11-26T01:00:00.000Z',
  });
  const context = (id: string) => ({ params: Promise.resolve({ id }) });
  expect((await getProject(new Request(url('/api/v2/market/planner/projects/x')), context('x'))).status).toBe(400);
  expect((await getProject(new Request(url('/x')), context('33333333-3333-4333-8333-333333333333'))).status).toBe(404);
  const request = new Request(url(`/api/v2/market/planner/projects/${projectId}`));
  const body = await (await getProject(request, context(projectId))).json();
  expect(state.collect).toHaveBeenCalledWith(session, ['Water'], { player: '101', controller: '202' }, request.signal);
  expect(body.materials[0]).toMatchObject({ needed: '10', owned: '6', ownedComplete: true, toBuy: '4' });
  expect(body.materials[0].estimate).toMatchObject({ cost: '42', shortfall: '0' });
  expect(body.coverage.items).toBeUndefined();
  expect(body.items).toBeUndefined();
});

it('returns only aggregate activity and an explicit unsupported state', async () => {
  state.trades.mockResolvedValue({ status: 'unsupported', message: 'No history.', readAt: 'now' });
  expect(await (await getActivity(new Request(url('/api/v2/market/activity?hours=24')))).json()).toMatchObject({
    status: 'unsupported',
  });
  expect((await getActivity(new Request(url('/api/v2/market/activity?hours=5')))).status).toBe(400);
  state.trades.mockResolvedValue({
    status: 'ok',
    trades: [
      { at: new Date().toISOString(), templateId: 'Water', name: 'Water', units: '2', value: '20', sellerId: '555' },
    ],
    coverage: { fetched: 1, excluded: 0, reported: 1, truncated: false, sellerIds: true },
    totals: null,
    readAt: 'now',
  });
  const body = await (await getActivity(new Request(url('/api/v2/market/activity?hours=24&q=water')))).json();
  expect(state.trades).toHaveBeenLastCalledWith(24, 'all', 'water');
  expect(body.buckets.reduce((sum: number, bucket: { trades: number }) => sum + bucket.trades, 0)).toBe(1);
  expect(JSON.stringify(body)).not.toMatch(/555|sellerId|Water/);
});

it('attributes sales only through explicit seller IDs for the fresh linked character', async () => {
  state.trades.mockResolvedValue({
    status: 'ok',
    trades: [],
    coverage: { fetched: 3, excluded: 0, reported: 3, truncated: false, sellerIds: false },
    totals: null,
    readAt: 'now',
  });
  expect(await (await getSales(new Request(url('/api/v2/market/sales?hours=168')))).json()).toMatchObject({
    status: 'unattributable',
  });
  const at = new Date().toISOString();
  state.trades.mockResolvedValue({
    status: 'ok',
    trades: [
      { at, templateId: 'Water', name: 'Water', units: '2', value: '20', sellerId: '101' },
      { at, templateId: 'Water', name: 'Water', units: '9', value: '90', sellerId: '999' },
      { at, templateId: 'Water', name: 'Water', units: '9', value: '90', sellerId: null },
    ],
    coverage: { fetched: 3, excluded: 0, reported: 3, truncated: false, sellerIds: true },
    totals: null,
    readAt: 'now',
  });
  const body = await (await getSales(new Request(url('/api/v2/market/sales?hours=168&sellerId=999')))).json();
  expect(state.trades).toHaveBeenLastCalledWith(168, 'player');
  expect(body.summary).toMatchObject({ sales: 1, units: '2', value: '20' });
  expect(body.coverage.unattributed).toBe(1);
  expect(JSON.stringify(body)).not.toMatch(/999|sellerId/);
  state.linked.mockRejectedValue(new AppError('Link first', 403, 'UNLINKED', true));
  expect((await getSales(new Request(url('/api/v2/market/sales')))).status).toBe(403);
});
