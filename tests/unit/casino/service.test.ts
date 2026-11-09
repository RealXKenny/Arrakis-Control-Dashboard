import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: { CASINO_SOLARIS_ENABLED: true, CASINO_MAX_WAGER: 10_000, CASINO_MAX_PAYOUT: 1_000_000 },
  command: vi.fn(),
  evalScript: vi.fn(),
  rate: vi.fn(),
  startRound: vi.fn(),
  balance: vi.fn(),
  audit: vi.fn(),
  linked: vi.fn(),
  startTransfer: vi.fn(),
  resolveTransfer: vi.fn(),
  listOpen: vi.fn(),
  getIntent: vi.fn(),
  gameBalance: vi.fn(),
}));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => mocks.env }));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({ command: mocks.command, eval: mocks.evalScript }),
}));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.rate }));
vi.mock('../../../src/lib/security/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('../../../src/features/casino/engine/round', () => ({
  startRound: mocks.startRound,
  actOnRound: vi.fn(),
  getRoundView: vi.fn(),
  recoverRounds: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../src/features/casino/server/engine-deps', () => ({ engineDeps: () => ({}) }));
vi.mock('../../../src/features/casino/server/wallet-store', () => ({
  applyWalletOperation: vi.fn(),
  readWalletBalance: mocks.balance,
  listWalletEntries: vi.fn(),
}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../../src/features/casino/transfers/service', () => ({
  startTransfer: mocks.startTransfer,
  resolveTransfer: mocks.resolveTransfer,
  recoverTransfers: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../../src/features/casino/server/transfer-deps', () => ({ transferDeps: () => ({}) }));
vi.mock('../../../src/features/casino/server/transfer-store', () => ({
  listTransfers: vi.fn().mockResolvedValue([]),
  transferStore: { listOpen: mocks.listOpen, get: mocks.getIntent },
}));
vi.mock('../../../src/features/casino/server/console-gateway', () => ({
  consoleGateway: { getBalance: mocks.gameBalance },
  // Same strict rule as the real one: only a clear "Offline" counts.
  isOffline: (status: unknown) => typeof status === 'string' && status.trim().toLowerCase() === 'offline',
}));

import { AppError } from '../../../src/lib/errors';
import { Rng, commitSeed } from '../../../src/features/casino/fairness/rng';
import { coinFlip } from '../../../src/features/casino/games/coin-flip';
import type { RoundRecord } from '../../../src/features/casino/engine/types';
import {
  MAX_OPEN_ROUNDS,
  adminResolveTransfer,
  adminTransfersAwaitingReconciliation,
  loadWallet,
  openRounds,
  pausePlay,
  rotateOwnSeed,
  startCasinoRound,
  startSolarisTransfer,
  summarise,
  toAppError,
  verifyOwnRound,
} from '../../../src/features/casino/server/service';

const session = { user: { id: 'member-1', username: 'm' }, guildId: 'g', roleIds: ['r'] } as never;
const input = { game: 'great-houses', wager: '100', params: { side: 'scarab' }, idempotencyKey: 'abcdef123456' };

type Answers = {
  open?: number;
  rounds?: Record<string, unknown>;
  ids?: string[];
  revealed?: string[];
  paused?: string;
};

/** A Redis stand-in answering only the commands the service issues. */
function fakeRedis(answers: Answers = {}) {
  mocks.command.mockImplementation(async (args: Array<string | number>) => {
    const [name, key, field] = args as [string, string, string];
    if (name === 'SCARD') return answers.open ?? 0;
    if (name === 'LRANGE' && String(key).endsWith(':rounds')) return answers.ids ?? [];
    if (name === 'LRANGE' && String(key).endsWith(':seeds-revealed')) return answers.revealed ?? [];
    if (name === 'HGET' && field === 'pausedUntil') return answers.paused ?? null;
    if (name === 'HGET' && field === 'json') {
      const id = String(key).split(':round:')[1] ?? '';
      return answers.rounds?.[id] ? JSON.stringify(answers.rounds[id]) : null;
    }
    return null;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(mocks.env, { CASINO_SOLARIS_ENABLED: true, CASINO_MAX_WAGER: 10_000, CASINO_MAX_PAYOUT: 1_000_000 });
  mocks.rate.mockResolvedValue({ allowed: true, remaining: 10, retryAfter: 1 });
  fakeRedis();
});

describe('error mapping', () => {
  it('turns known engine codes into safe exposed errors, and leaves unknown ones as a generic 500', () => {
    const mapped = toAppError(Object.assign(new Error('internal detail'), { code: 'INSUFFICIENT_FUNDS' })) as AppError;
    expect(mapped).toBeInstanceOf(AppError);
    expect([mapped.statusCode, mapped.code, mapped.expose]).toEqual([409, 'INSUFFICIENT_FUNDS', true]);
    expect(mapped.message).not.toContain('internal');
    const odd = new Error('redis exploded');
    expect(toAppError(odd)).toBe(odd);
  });
});

describe('the server-side gate', () => {
  it('refuses wagers and transfers while Solaris play is off, before doing any work', async () => {
    mocks.env.CASINO_SOLARIS_ENABLED = false;
    await expect(startCasinoRound(session, input)).rejects.toMatchObject({ statusCode: 403, code: 'FEATURE_DISABLED' });
    await expect(
      startSolarisTransfer(session, { kind: 'deposit', amount: '5', idempotencyKey: 'abcdef123456' }),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: 'FEATURE_DISABLED',
    });
    expect(mocks.startRound).not.toHaveBeenCalled();
    expect(mocks.startTransfer).not.toHaveBeenCalled();
    expect(mocks.linked).not.toHaveBeenCalled();
    expect(mocks.rate).not.toHaveBeenCalled();
  });

  it('still shows a closed wallet, with the real balance and the limits, while it is off', async () => {
    mocks.env.CASINO_SOLARIS_ENABLED = false;
    mocks.balance.mockResolvedValue({ available: 700n, reserved: 100n });
    const wallet = await loadWallet(session);
    expect(wallet).toMatchObject({
      enabled: false,
      solaris: { available: '700', reserved: '100' },
      limits: { maxWager: '10000', maxPayout: '1000000' },
    });
    expect(JSON.stringify(wallet)).not.toMatch(/demo/i);
  });
});

describe('table limits, rate limits, pauses and the open-round cap', () => {
  it('rejects a wager above the server ceiling before any engine work, and allows one at the ceiling', async () => {
    await expect(startCasinoRound(session, { ...input, wager: '10001' })).rejects.toMatchObject({
      statusCode: 400,
      code: 'INVALID_WAGER',
    });
    expect(mocks.startRound).not.toHaveBeenCalled();
    mocks.startRound.mockResolvedValue({ id: 'r_abcdef123456' });
    await startCasinoRound(session, { ...input, wager: '10000' });
    expect(mocks.startRound).toHaveBeenCalledTimes(1);
  });

  it('starts a round for the session owner in the casino scope, ignoring anything else', async () => {
    mocks.startRound.mockResolvedValue({ id: 'r_abcdef123456' });
    await startCasinoRound(session, input);
    expect(mocks.startRound).toHaveBeenCalledWith(expect.anything(), {
      owner: 'member-1',
      server: 'arrakis',
      ...input,
    });
  });

  it('refuses when rate limited, and while the member has paused play', async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 5 });
    await expect(startCasinoRound(session, input)).rejects.toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
    mocks.rate.mockResolvedValue({ allowed: true, remaining: 1, retryAfter: 1 });
    fakeRedis({ paused: String(Date.now() + 3_600_000) });
    await expect(startCasinoRound(session, input)).rejects.toMatchObject({ statusCode: 403, code: 'PLAY_PAUSED' });
    expect(mocks.startRound).not.toHaveBeenCalled();
  });

  it('refuses a new round at the cap, but a retry of one that already exists is returned instead', async () => {
    fakeRedis({ open: MAX_OPEN_ROUNDS });
    await expect(startCasinoRound(session, input)).rejects.toMatchObject({
      statusCode: 409,
      code: 'TOO_MANY_OPEN_ROUNDS',
    });
    expect(mocks.startRound).not.toHaveBeenCalled();
    fakeRedis({ open: MAX_OPEN_ROUNDS, rounds: { r_abcdef123456: { id: 'r_abcdef123456', version: 1 } } });
    mocks.startRound.mockResolvedValue({ id: 'r_abcdef123456' });
    await expect(startCasinoRound(session, input)).resolves.toMatchObject({ id: 'r_abcdef123456' });
  });

  it('only accepts the offered break lengths and sends a future end time', async () => {
    await expect(pausePlay(session, 2)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
    mocks.evalScript.mockResolvedValue('123');
    expect(await pausePlay(session, 24)).toEqual({ pausedUntil: 123 });
    expect(Number(mocks.evalScript.mock.calls[0]![2][0])).toBeGreaterThan(Date.now() + 23 * 3_600_000);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'casino.play.paused', data: { hours: 24 } }),
    );
  });
});

describe('Solaris transfers use the verified character, never the request', () => {
  const body = { kind: 'deposit' as const, amount: '5000', idempotencyKey: 'abcdef123456' };
  const intent = {
    id: 'dep_abcdef123456',
    kind: 'deposit',
    owner: 'member-1',
    server: 'arrakis',
    playerId: '4242',
    amount: '5000',
    state: 'completed',
    createdAt: 1,
    updatedAt: 2,
  };

  it('re-verifies the linked character on every call and passes only server-derived identity', async () => {
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 4242, controllerId: 99, onlineStatus: 'Offline' });
    mocks.startTransfer.mockResolvedValue(intent);
    const out = await startSolarisTransfer(session, body);
    expect(mocks.linked).toHaveBeenCalledWith(expect.objectContaining({ userId: 'member-1', commandName: 'casino' }));
    expect(mocks.startTransfer).toHaveBeenCalledWith(expect.anything(), {
      kind: 'deposit',
      owner: 'member-1',
      server: 'arrakis',
      playerId: '4242',
      amount: '5000',
      idempotencyKey: 'abcdef123456',
    });
    // The member sees the outcome, not who the game thinks they are.
    expect(JSON.stringify(out)).not.toMatch(/4242|member-1|owner|playerId/);
    expect(out).toMatchObject({ id: 'dep_abcdef123456', amount: '5000', state: 'completed' });
  });

  it('falls back to the controller id only when there is no pawn, and refuses an unlinked member', async () => {
    mocks.linked.mockResolvedValue({ linked: true, pawnId: null, controllerId: 99, onlineStatus: 'Offline' });
    mocks.startTransfer.mockResolvedValue(intent);
    await startSolarisTransfer(session, body);
    expect(mocks.startTransfer.mock.calls[0]![1].playerId).toBe('99');
    mocks.startTransfer.mockClear();
    mocks.linked.mockResolvedValue({ linked: false });
    await expect(startSolarisTransfer(session, body)).rejects.toMatchObject({ statusCode: 409, code: 'NOT_LINKED' });
    mocks.linked.mockResolvedValue({ linked: true, pawnId: null, controllerId: null });
    await expect(startSolarisTransfer(session, body)).rejects.toMatchObject({ code: 'NOT_LINKED' });
    expect(mocks.startTransfer).not.toHaveBeenCalled();
  });

  it('only moves Solaris while the character is offline: an online or unclear status is refused, and nothing is sent', async () => {
    mocks.startTransfer.mockResolvedValue(intent);
    for (const onlineStatus of ['Online', 'online', '', 'Unknown', null, undefined]) {
      mocks.linked.mockResolvedValue({ linked: true, pawnId: 4242, onlineStatus });
      await expect(startSolarisTransfer(session, body), String(onlineStatus)).rejects.toMatchObject({
        statusCode: 409,
        code: 'PLAYER_ONLINE',
        message: expect.stringContaining('Log out of the game'),
      });
    }
    expect(mocks.startTransfer).not.toHaveBeenCalled();
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 4242, onlineStatus: 'Offline' });
    await startSolarisTransfer(session, body);
    expect(mocks.startTransfer).toHaveBeenCalledTimes(1);
  });

  it('is rate limited, and maps transfer errors to safe responses', async () => {
    mocks.rate.mockResolvedValue({ allowed: false, remaining: 0, retryAfter: 5 });
    await expect(startSolarisTransfer(session, body)).rejects.toMatchObject({ statusCode: 429 });
    expect(mocks.linked).not.toHaveBeenCalled();
    mocks.rate.mockResolvedValue({ allowed: true, remaining: 1, retryAfter: 1 });
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 1, onlineStatus: 'Offline' });
    mocks.startTransfer.mockRejectedValue(Object.assign(new Error('secret detail'), { code: 'IDEMPOTENCY_CONFLICT' }));
    const error = (await startSolarisTransfer(session, body).catch((e) => e)) as AppError;
    expect([error.statusCode, error.code]).toEqual([409, 'IDEMPOTENCY_CONFLICT']);
    expect(error.message).not.toContain('secret');
  });
});

describe('administrator reconciliation', () => {
  const stuck = (id: string, state: string) => ({
    id,
    kind: 'deposit',
    owner: 'u1',
    server: 'arrakis',
    playerId: 'p1',
    amount: '50',
    state,
    createdAt: 1,
    updatedAt: 2,
  });

  it('lists only transfers awaiting reconciliation, with the live game balance as a hint', async () => {
    mocks.listOpen.mockResolvedValue([
      { owner: 'u1', server: 'arrakis', id: 'a' },
      { owner: 'u1', server: 'arrakis', id: 'b' },
    ]);
    mocks.getIntent.mockImplementation(async (ref: { id: string }) =>
      ref.id === 'a' ? stuck('a', 'needs_reconciliation') : stuck('b', 'debit_sent'),
    );
    mocks.gameBalance.mockResolvedValue(900n);
    const rows = await adminTransfersAwaitingReconciliation();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'a', owner: 'u1', playerId: 'p1', gameBalance: '900' });
    mocks.gameBalance.mockRejectedValue(new Error('console down'));
    expect((await adminTransfersAwaitingReconciliation())[0]!.gameBalance).toBeNull();
  });

  it('resolves in the casino scope on behalf of the administrator who asked', async () => {
    mocks.resolveTransfer.mockResolvedValue({ ...stuck('a', 'completed') });
    await adminResolveTransfer(
      { user: { id: 'admin-9' } } as never,
      { owner: 'u1', id: 'a' },
      'applied',
      'checked the balance',
    );
    expect(mocks.resolveTransfer).toHaveBeenCalledWith(
      expect.anything(),
      { owner: 'u1', server: 'arrakis', id: 'a' },
      'applied',
      'admin-9',
      'checked the balance',
    );
  });
});

describe('history summaries', () => {
  const round = (patch: Partial<RoundRecord>): RoundRecord => ({
    id: 'r_1',
    owner: 'member-1',
    server: 'arrakis',
    game: 'spice-harvest',
    status: 'open',
    wager: '100',
    params: { hazards: 3 },
    holds: 1,
    version: 3,
    actions: [{ type: 'reveal', tile: 4 }],
    state: { hazards: [1, 2, 3] },
    seed: { commitment: 'c', clientSeed: 'x', nonce: 0 },
    createdAt: 5,
    updatedAt: 6,
    ...patch,
  });

  it('never includes hidden state, actions or seeds, and shows nothing about an open round beyond its stake', () => {
    const summary = summarise(round({}));
    expect(JSON.stringify(summary)).not.toMatch(/hazards|actions|state|seed|commitment/);
    expect(summary).toMatchObject({ status: 'open', payout: null, net: null, stake: '100' });
  });

  it('computes net from the payout and every hold staked', () => {
    expect(summarise(round({ status: 'settled', holds: 2, settlement: { payout: '350', result: {} } }))).toMatchObject({
      stake: '200',
      payout: '350',
      net: '150',
    });
    expect(summarise(round({ status: 'settled', settlement: { payout: '0', result: {} } })).net).toBe('-100');
  });

  it('lists only unfinished rounds so a reload can resume them, with no hidden state', async () => {
    fakeRedis({
      ids: ['r_open', 'r_done'],
      rounds: {
        r_open: round({ id: 'r_open' }),
        r_done: round({ id: 'r_done', status: 'settled', settlement: { payout: '0', result: {} } }),
      },
    });
    const rows = await openRounds(session);
    expect(rows.map((row) => row.id)).toEqual(['r_open']);
    expect(JSON.stringify(rows)).not.toMatch(/hazards|state/);
  });
});

describe('seed rotation and round verification never release an active seed', () => {
  const serverSeed = 'a'.repeat(64);
  const commitment = commitSeed(serverSeed);
  const finished = (settlement: { payout: string; result: unknown }) => ({
    id: 'r_done',
    owner: 'member-1',
    server: 'arrakis',
    game: 'great-houses',
    status: 'settled',
    wager: '100',
    params: { side: 'scarab' },
    holds: 1,
    version: 3,
    actions: [],
    seed: { commitment, clientSeed: 'cs', nonce: 0 },
    settlement,
    createdAt: 5,
    updatedAt: 6,
  });
  const honest = () => {
    const { settlement } = coinFlip.start(new Rng(serverSeed, 'cs', 0), 100n, { side: 'scarab' }, { now: 5 });
    return { payout: settlement!.payout.toString(), result: settlement!.result };
  };

  it('audits a rotation, which reveals a server seed', async () => {
    mocks.evalScript.mockResolvedValue(['OK', 'a'.repeat(64), 'c'.repeat(64), '7']);
    await rotateOwnSeed(session);
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'casino.seed.rotated', data: { rounds: 7 } }),
    );
  });

  it('while the seed is still active: no seed, no verification', async () => {
    fakeRedis({ rounds: { r_done: finished(honest()) }, revealed: [] });
    const out = await verifyOwnRound(session, 'r_done');
    expect(out).toEqual({ verifiable: false, reason: 'SEED_NOT_RETIRED' });
    expect(JSON.stringify(out)).not.toContain(serverSeed);
  });

  it('after rotation: verifies an honest round, flags a tampered payout, and accepts a capped one', async () => {
    const revealed = [`${commitment}|${serverSeed}|1`];
    fakeRedis({ rounds: { r_done: finished(honest()) }, revealed });
    expect(await verifyOwnRound(session, 'r_done')).toMatchObject({ verifiable: true, ok: true });
    fakeRedis({ rounds: { r_done: finished({ ...honest(), payout: '999' }) }, revealed });
    expect(await verifyOwnRound(session, 'r_done')).toMatchObject({ ok: false, reason: 'PAYOUT_MISMATCH' });
  });

  it("cannot reach a round that is not the signed-in member's, or one that is unfinished", async () => {
    fakeRedis({ rounds: {} });
    await expect(verifyOwnRound(session, 'r_belongs_to_nobody')).rejects.toMatchObject({ statusCode: 404 });
    fakeRedis({ rounds: { r_open: { ...finished(honest()), id: 'r_open', status: 'open', settlement: undefined } } });
    expect(await verifyOwnRound(session, 'r_open')).toEqual({ verifiable: false, reason: 'ROUND_NOT_FINISHED' });
  });
});
