import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { seasonTemplate } from '../../../src/features/seasons/contracts';
const mock = vi.hoisted(() => ({
  reply: null as ReturnType<typeof createSeasonFixture>,
  linked: vi.fn(),
  grant: vi.fn(),
  balance: vi.fn(),
}));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    command: async ([op, key, ...args]: (string | number)[]) =>
      mock.reply(String(op), String(key), args.map(String))?.value,
    eval: async (script: string, keys: string[], args: (string | number)[]) =>
      mock.reply('EVAL', script, [String(keys.length), ...keys, ...args.map(String)])?.value,
  }),
}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mock.linked }));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('../../../src/features/seasons/server/delivery-gateway', () => ({
  deliveryAvailable: () => true,
  offline: (v: unknown) => v === 'Offline',
  currencyOf: (r: { type: string }) => (r.type === 'solaris' || r.type === 'house-credits' ? r.type : null),
  deliveryGateway: { grant: mock.grant, balance: mock.balance },
}));
import { commit, loadMember, seasonKeys } from '../../../src/features/seasons/server/store';
import { saveSeason, transitionSeason } from '../../../src/features/seasons/server/engine';
import {
  claimAttention,
  claimGameReward,
  loadGameClaims,
  recoverClaims,
} from '../../../src/features/seasons/server/claims';

beforeEach(() => {
  vi.clearAllMocks();
  mock.reply = createSeasonFixture();
  mock.linked.mockResolvedValue({ linked: true, pawnId: '42', controllerId: '43', onlineStatus: 'Offline' });
  mock.grant.mockResolvedValue('delivered');
  mock.balance.mockResolvedValue(1000n);
});
async function setup() {
  const definition = seasonTemplate();
  definition.startsAt = new Date(Date.now() - 3600000).toISOString();
  definition.rewards[0].bundle = [
    { type: 'solaris', amount: '100' },
    { type: 'item', itemId: 'IronOre', quantity: 5, quality: 0 },
  ];
  const draft = await saveSeason(randomUUID(), '', definition, 'creator');
  const season = await transitionSeason(draft.id, draft.revision, 'publish', 'creator');
  const member = await loadMember(season.id, 'member');
  member.progress.value.xp = 700;
  member.progress.value.ledger = [
    { id: randomUUID(), delta: 700, reason: 'Fixture', at: new Date().toISOString(), actor: 'fixture' },
  ];
  await commit({
    id: season.id,
    actor: 'fixture',
    action: 'test.progress',
    writes: [
      { key: seasonKeys.season(season.id), before: member.season.raw },
      { key: seasonKeys.progress(season.id, 'member'), before: member.progress.raw, after: member.progress.value },
    ],
  });
  return season;
}
describe('reward recovery worker', () => {
  it('quarantines an interrupted send without ever contacting the game', async () => {
    const season = await setup();
    mock.grant.mockImplementationOnce(async () => {
      throw new Error('process died after the marker');
    });
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow();
    expect(await claimAttention(season.id)).toHaveLength(1);
    const stuck = await loadGameClaims(season.id, 'member');
    stuck.value.wayfarer.components[0].attemptedAt = new Date(Date.now() - 300000).toISOString();
    await commit({
      id: season.id,
      actor: 'fixture',
      action: 'test.age',
      writes: [{ key: seasonKeys.gameClaims(season.id, 'member'), before: stuck.raw, after: stuck.value }],
    });
    mock.grant.mockClear();
    mock.balance.mockClear();
    const first = await recoverClaims(season.id);
    expect(first).toMatchObject({ parked: 1, quarantined: 1, cleared: 0 });
    expect(mock.grant).not.toHaveBeenCalled();
    expect(mock.balance).not.toHaveBeenCalled();
    expect((await loadGameClaims(season.id, 'member')).value.wayfarer.components[0].status).toBe('uncertain');
    // Repeated sweeps never change the quarantine or send anything.
    expect(await recoverClaims(season.id)).toMatchObject({ parked: 0, quarantined: 1 });
    expect(mock.grant).not.toHaveBeenCalled();
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow('uncertain');
  });
  it('clears a finished claim from the in-flight index and leaves in-progress sends alone', async () => {
    const season = await setup();
    await claimGameReward(season.id, 'member', 'wayfarer');
    expect(await claimAttention(season.id)).toEqual([]);
    expect(await recoverClaims(season.id)).toEqual({ parked: 0, quarantined: 0, cleared: 0 });
    expect(mock.grant).toHaveBeenCalledTimes(2);
  });
});
