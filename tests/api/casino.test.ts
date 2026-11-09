import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.APP_URL = 'https://portal.test';
  return {
    session: vi.fn(),
    loadWallet: vi.fn(),
    ownTransfers: vi.fn(),
    startTransfer: vi.fn(),
    adminList: vi.fn(),
    adminResolve: vi.fn(),
    admin: vi.fn(),
    recent: vi.fn(),
    walletEntries: vi.fn(),
    start: vi.fn(),
    act: vi.fn(),
    view: vi.fn(),
    history: vi.fn(),
    openRounds: vi.fn(),
    fairness: vi.fn(),
    rotate: vi.fn(),
    clientSeed: vi.fn(),
    verify: vi.fn(),
    pause: vi.fn(),
    pausedUntil: vi.fn(),
  };
});
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session, currentSessionId: vi.fn() }));
vi.mock('../../src/features/casino/server/service', () => ({
  PAUSE_HOURS: [1, 24, 168, 720],
  ownerOf: (session: { user: { id: string } }) => session.user.id,
  loadWallet: mocks.loadWallet,
  ownTransfers: mocks.ownTransfers,
  startSolarisTransfer: mocks.startTransfer,
  adminTransfersAwaitingReconciliation: mocks.adminList,
  adminResolveTransfer: mocks.adminResolve,
  walletEntries: mocks.walletEntries,
  startCasinoRound: mocks.start,
  actCasinoRound: mocks.act,
  viewCasinoRound: mocks.view,
  casinoHistory: mocks.history,
  openRounds: mocks.openRounds,
  fairnessState: mocks.fairness,
  rotateOwnSeed: mocks.rotate,
  changeClientSeed: mocks.clientSeed,
  verifyOwnRound: mocks.verify,
  pausePlay: mocks.pause,
  pausedUntil: mocks.pausedUntil,
}));

vi.mock('../../src/features/admin/server/api-access', () => ({
  requireApiAdmin: mocks.admin,
  spendAdminBudget: vi.fn(),
}));
vi.mock('../../src/features/admin/server/access', () => ({ requireRecentSignIn: mocks.recent }));

import { GET as ADMIN_GET, POST as ADMIN_POST } from '../../src/app/api/v2/casino/admin/transfers/route';
import { GET as TRANSFERS_GET, POST as TRANSFERS_POST } from '../../src/app/api/v2/casino/transfers/route';
import { GET as FAIRNESS_GET, POST as FAIRNESS_POST } from '../../src/app/api/v2/casino/fairness/route';
import { GET as LIMITS_GET, POST as LIMITS_POST } from '../../src/app/api/v2/casino/limits/route';
import { POST as ACTION } from '../../src/app/api/v2/casino/rounds/[id]/action/route';
import { GET as ROUND } from '../../src/app/api/v2/casino/rounds/[id]/route';
import { GET as ROUNDS_GET, POST as ROUNDS_POST } from '../../src/app/api/v2/casino/rounds/route';
import { GET as VERIFY } from '../../src/app/api/v2/casino/verify/route';
import { GET as WALLET_GET } from '../../src/app/api/v2/casino/wallet/route';

const ORIGIN = 'https://portal.test';
const post = (path: string, body: unknown, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      ...(origin ? { Origin: origin } : {}),
      'Content-Type': 'application/json',
      'X-Forwarded-Proto': 'https',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const transfer = { kind: 'deposit', amount: '5000', idempotencyKey: 'abcdef123456' };
const start = { game: 'great-houses', wager: '100', params: { side: 'scarab' }, idempotencyKey: 'abcdef123456' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('APP_URL', ORIGIN);
  mocks.session.mockResolvedValue({ user: { id: 'member-1' } });
});

describe('casino HTTP boundary', () => {
  it('requires a session for every read and write before touching any service', async () => {
    mocks.session.mockResolvedValue(null);
    const calls = [
      WALLET_GET(get('/api/v2/casino/wallet')),
      TRANSFERS_GET(get('/api/v2/casino/transfers')),
      TRANSFERS_POST(post('/api/v2/casino/transfers', transfer)),
      ROUNDS_GET(get('/api/v2/casino/rounds')),
      ROUNDS_POST(post('/api/v2/casino/rounds', start)),
      ROUND(get('/api/v2/casino/rounds/r_1'), params('r_1')),
      ACTION(post('/api/v2/casino/rounds/r_1/action', { action: {} }), params('r_1')),
      FAIRNESS_GET(get('/api/v2/casino/fairness')),
      FAIRNESS_POST(post('/api/v2/casino/fairness', { action: 'rotate' })),
      VERIFY(get('/api/v2/casino/verify?round=r_1')),
      LIMITS_GET(get('/api/v2/casino/limits')),
      LIMITS_POST(post('/api/v2/casino/limits', { pauseHours: 24 })),
    ];
    for (const response of await Promise.all(calls)) expect(response.status).toBe(401);
    for (const mock of Object.values(mocks)) if (mock !== mocks.session) expect(mock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and origin-less mutations', async () => {
    for (const origin of ['https://evil.test', null]) {
      expect((await ROUNDS_POST(post('/api/v2/casino/rounds', start, origin))).status).toBe(403);
      expect(
        (await ACTION(post('/api/v2/casino/rounds/r_1/action', { action: {} }, origin), params('r_1'))).status,
      ).toBe(403);
      expect((await TRANSFERS_POST(post('/api/v2/casino/transfers', transfer, origin))).status).toBe(403);
      expect((await FAIRNESS_POST(post('/api/v2/casino/fairness', { action: 'rotate' }, origin))).status).toBe(403);
      expect((await LIMITS_POST(post('/api/v2/casino/limits', { pauseHours: 24 }, origin))).status).toBe(403);
    }
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.startTransfer).not.toHaveBeenCalled();
  });

  it('starts a round with the validated body and the session, never client-claimed identity', async () => {
    mocks.start.mockResolvedValue({ id: 'r_abcdef123456' });
    const response = await ROUNDS_POST(post('/api/v2/casino/rounds', start));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.start).toHaveBeenCalledWith({ user: { id: 'member-1' } }, start);
    for (const extra of [
      { owner: 'someone-else' },
      { currency: 'solaris' },
      { playerId: '1' },
      { balance: '999999' },
    ]) {
      const rejected = await ROUNDS_POST(post('/api/v2/casino/rounds', { ...start, ...extra }));
      expect(rejected.status).toBe(400);
    }
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed, oversized and wrongly typed bodies', async () => {
    expect((await ROUNDS_POST(post('/api/v2/casino/rounds', '{not json'))).status).toBe(400);
    expect((await ROUNDS_POST(post('/api/v2/casino/rounds', { ...start, wager: 100 }))).status).toBe(400);
    expect(
      (await ROUNDS_POST(post('/api/v2/casino/rounds', { ...start, idempotencyKey: 'x'.repeat(65) }))).status,
    ).toBe(400);
    expect((await ROUNDS_POST(post('/api/v2/casino/rounds', { ...start, params: 'x'.repeat(20_000) }))).status).toBe(
      413,
    );
    for (const bad of [
      { ...transfer, kind: 'grant' },
      { ...transfer, amount: 5000 },
      { ...transfer, amount: '1'.repeat(15) },
      { ...transfer, playerId: '4242' },
      { ...transfer, owner: 'someone-else' },
      { ...transfer, currency: 'demo' },
      { kind: 'deposit', amount: '5' },
    ])
      expect((await TRANSFERS_POST(post('/api/v2/casino/transfers', bad))).status).toBe(400);
    expect((await LIMITS_POST(post('/api/v2/casino/limits', { pauseHours: '24' }))).status).toBe(400);
    expect((await FAIRNESS_POST(post('/api/v2/casino/fairness', { action: 'reveal' }))).status).toBe(400);
    expect(mocks.start).not.toHaveBeenCalled();
    expect(mocks.startTransfer).not.toHaveBeenCalled();
  });

  it('validates round identifiers before any lookup', async () => {
    for (const id of ['../x', 'a b', 'x'.repeat(81), 'a|b']) {
      expect((await ROUND(get('/api/v2/casino/rounds/x'), params(id))).status).toBe(404);
      expect((await ACTION(post('/api/v2/casino/rounds/x/action', { action: {} }), params(id))).status).toBe(404);
    }
    expect((await VERIFY(get('/api/v2/casino/verify?round=../x'))).status).toBe(404);
    expect(mocks.view).not.toHaveBeenCalled();
    expect(mocks.act).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('passes an action to the service for the signed-in member only', async () => {
    mocks.act.mockResolvedValue({ id: 'r_1' });
    const response = await ACTION(post('/api/v2/casino/rounds/r_1/action', { action: { type: 'hit' } }), params('r_1'));
    expect(response.status).toBe(200);
    expect(mocks.act).toHaveBeenCalledWith({ user: { id: 'member-1' } }, 'r_1', { type: 'hit' });
  });

  it('exposes wallet entries only through the signed-in member, and the public fairness state', async () => {
    mocks.loadWallet.mockResolvedValue({ solaris: { available: '10', reserved: '0' } });
    mocks.walletEntries.mockResolvedValue([]);
    expect((await WALLET_GET(get('/api/v2/casino/wallet?entries=1&offset=25'))).status).toBe(200);
    expect(mocks.walletEntries).toHaveBeenCalledWith({ user: { id: 'member-1' } }, 25);
    mocks.fairness.mockResolvedValue({ commitment: 'abc', clientSeed: 'c', nonce: 0, revealed: [] });
    const body = await (await FAIRNESS_GET(get('/api/v2/casino/fairness'))).json();
    expect(JSON.stringify(body)).not.toMatch(/"serverSeed"/);
  });

  it('serves unfinished rounds for resuming, separately from the history list', async () => {
    mocks.openRounds.mockResolvedValue([{ id: 'r_1' }]);
    mocks.history.mockResolvedValue([]);
    await ROUNDS_GET(get('/api/v2/casino/rounds?status=open'));
    expect(mocks.openRounds).toHaveBeenCalledWith({ user: { id: 'member-1' } });
    expect(mocks.history).not.toHaveBeenCalled();
    await ROUNDS_GET(get('/api/v2/casino/rounds?limit=5'));
    expect(mocks.history).toHaveBeenCalledWith({ user: { id: 'member-1' } }, 5);
  });

  it('keeps a pause request to the offered lengths', async () => {
    mocks.pause.mockResolvedValue({ pausedUntil: 1 });
    expect((await LIMITS_POST(post('/api/v2/casino/limits', { pauseHours: 24 }))).status).toBe(200);
    expect(mocks.pause).toHaveBeenCalledWith({ user: { id: 'member-1' } }, 24);
  });

  it('moves Solaris only for the signed-in member, with a body that names no player, currency or server', async () => {
    mocks.startTransfer.mockResolvedValue({ id: 'dep_abcdef123456', state: 'completed' });
    const response = await TRANSFERS_POST(post('/api/v2/casino/transfers', transfer));
    expect(response.status).toBe(200);
    expect(mocks.startTransfer).toHaveBeenCalledWith({ user: { id: 'member-1' } }, transfer);
    mocks.ownTransfers.mockResolvedValue([]);
    expect((await TRANSFERS_GET(get('/api/v2/casino/transfers'))).status).toBe(200);
    expect(mocks.ownTransfers).toHaveBeenCalledWith({ user: { id: 'member-1' } });
  });

  it('removes any way to credit a wallet by request: there is no wallet write route', async () => {
    const wallet = await import('../../src/app/api/v2/casino/wallet/route');
    expect(Object.keys(wallet).sort()).toEqual(['GET']);
  });
});

describe('administrator reconciliation routes', () => {
  const resolve = {
    owner: '123456789',
    id: 'dep_abcdef123456',
    resolution: 'applied',
    note: 'balance dropped by 5,000',
  };
  beforeEach(() => {
    mocks.admin.mockResolvedValue({ user: { id: 'admin-9' } });
  });

  it('are closed to everyone who is not a verified administrator, before any service work', async () => {
    mocks.admin.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 403 }));
    const denied = [
      await ADMIN_GET(get('/api/v2/casino/admin/transfers')),
      await ADMIN_POST(post('/api/v2/casino/admin/transfers', resolve)),
    ];
    for (const response of denied) expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.adminList).not.toHaveBeenCalled();
    expect(mocks.adminResolve).not.toHaveBeenCalled();
  });

  it('lists transfers for an administrator and resolves with the administrator as the actor', async () => {
    mocks.adminList.mockResolvedValue([{ id: 'dep_abcdef123456' }]);
    expect((await ADMIN_GET(get('/api/v2/casino/admin/transfers'))).status).toBe(200);
    mocks.adminResolve.mockResolvedValue({ id: 'dep_abcdef123456', state: 'completed' });
    expect((await ADMIN_POST(post('/api/v2/casino/admin/transfers', resolve))).status).toBe(200);
    expect(mocks.recent).toHaveBeenCalledWith({ user: { id: 'admin-9' } }, { highRisk: true });
    expect(mocks.adminResolve).toHaveBeenCalledWith({ user: { id: 'admin-9' } }, resolve, 'applied', resolve.note);
  });

  it('needs a same-origin request, a strict body and a fresh sign-in', async () => {
    expect((await ADMIN_POST(post('/api/v2/casino/admin/transfers', resolve, 'https://evil.test'))).status).toBe(403);
    for (const bad of [
      { ...resolve, resolution: 'maybe' },
      { ...resolve, owner: '../x' },
      { ...resolve, note: 'x'.repeat(501) },
      { ...resolve, amount: '999999' },
    ])
      expect((await ADMIN_POST(post('/api/v2/casino/admin/transfers', bad))).status).toBe(400);
    mocks.recent.mockImplementation(() => {
      throw Object.assign(new Error('Sign in again'), { statusCode: 403 });
    });
    expect((await ADMIN_POST(post('/api/v2/casino/admin/transfers', resolve))).status).toBeGreaterThanOrEqual(400);
    expect(mocks.adminResolve).not.toHaveBeenCalled();
  });
});
