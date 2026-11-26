import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { seasonTemplate } from '../../../src/features/seasons/contracts';
const mock = vi.hoisted(() => ({
  reply: null as ReturnType<typeof createSeasonFixture>,
  enabled: true,
  linked: vi.fn(),
  grant: vi.fn(),
  balance: vi.fn(),
  limit: vi.fn(),
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
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: mock.limit }));
vi.mock('../../../src/features/seasons/server/delivery-gateway', () => ({
  deliveryAvailable: () => mock.enabled,
  offline: (v: unknown) => v === 'Offline',
  currencyOf: (r: { type: string }) => (r.type === 'solaris' || r.type === 'house-credits' ? r.type : null),
  deliveryGateway: { grant: mock.grant, balance: mock.balance },
}));
import { saveSeason, transitionSeason } from '../../../src/features/seasons/server/engine';
import { commit, loadMember, seasonKeys } from '../../../src/features/seasons/server/store';
import {
  claimAllAvailable,
  claimAttention,
  claimGameReward,
  claimState,
  loadGameClaims,
} from '../../../src/features/seasons/server/claims';
import type { Definition } from '../../../src/features/seasons/contracts';

const bundle = [
  { type: 'solaris' as const, amount: '500' },
  { type: 'item' as const, itemId: 'IronOre', quantity: 20, quality: 0 },
  { type: 'house-credits' as const, amount: '25' },
];
beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mock.reply = createSeasonFixture();
  mock.enabled = true;
  mock.linked.mockResolvedValue({ linked: true, pawnId: '42', controllerId: '43', onlineStatus: 'Offline' });
  mock.grant.mockResolvedValue('delivered');
  mock.balance.mockResolvedValue(1000n);
  mock.limit.mockResolvedValue({ allowed: true });
});
async function setup(mutate?: (d: Definition) => void, startOffsetHours = 1) {
  const definition = seasonTemplate();
  definition.startsAt = new Date(Date.now() - startOffsetHours * 3600000).toISOString();
  definition.rewards[0].bundle = bundle;
  definition.rewards[1].bundle = [{ type: 'solaris', amount: '10' }];
  mutate?.(definition);
  const draft = await saveSeason(randomUUID(), '', definition, 'creator');
  const season = await transitionSeason(draft.id, draft.revision, 'publish', 'creator');
  // Level 5: every reward is unlocked.
  const member = await loadMember(season.id, 'member');
  const progress = member.progress.value;
  progress.xp = 700;
  progress.ledger = [
    { id: randomUUID(), delta: 700, reason: 'Fixture', at: new Date().toISOString(), actor: 'fixture' },
  ];
  await commit({
    id: season.id,
    actor: 'fixture',
    action: 'test.progress',
    writes: [
      { key: seasonKeys.season(season.id), before: member.season.raw },
      { key: seasonKeys.progress(season.id, 'member'), before: member.progress.raw, after: progress },
    ],
  });
  return season;
}
describe('manual direct claims', () => {
  it('delivers each component once, tracks it, and makes repeats and concurrent clicks harmless', async () => {
    const season = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => claimGameReward(season.id, 'member', 'wayfarer')),
    );
    expect(results.some((r) => r.status === 'fulfilled' && r.value.state === 'claimed')).toBe(true);
    expect(mock.grant).toHaveBeenCalledTimes(3);
    const again = await claimGameReward(season.id, 'member', 'wayfarer');
    expect(again.state).toBe('claimed');
    expect(mock.grant).toHaveBeenCalledTimes(3);
    const claims = await loadGameClaims(season.id, 'member');
    expect(claims.value.wayfarer.components.map((c) => c.status)).toEqual(['delivered', 'delivered', 'delivered']);
    expect((await loadMember(season.id, 'member')).progress.value.claims.map((c) => c.reward.id)).toContain('wayfarer');
  });
  it('never delivers a locked reward or one from another account, and refuses while the player is online', async () => {
    const season = await setup();
    await expect(claimGameReward(season.id, 'stranger', 'wayfarer')).resolves.toBeDefined();
    expect(mock.grant).toHaveBeenCalledTimes(3);
    mock.grant.mockClear();
    await expect(claimGameReward(season.id, 'newcomer', 'spice-horizon')).rejects.toMatchObject({ statusCode: 403 });
    mock.linked.mockResolvedValue({ linked: true, pawnId: '77', controllerId: '78', onlineStatus: 'Online' });
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow('Log out');
    expect(mock.grant).not.toHaveBeenCalled();
  });
  it('rejects forged progress: a member below the level cannot claim', async () => {
    const season = await setup();
    await expect(claimGameReward(season.id, 'unlevelled', 'first-light')).rejects.toMatchObject({ statusCode: 403 });
  });
  it('keeps delivered components when a later one is uncertain and never resends anything', async () => {
    const season = await setup();
    mock.grant.mockResolvedValueOnce('delivered').mockResolvedValueOnce('uncertain');
    const first = await claimGameReward(season.id, 'member', 'wayfarer');
    expect(first.state).toBe('uncertain');
    expect(mock.grant).toHaveBeenCalledTimes(2);
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow('administrator');
    await expect(claimAllAvailable(season.id, 'member')).resolves.toMatchObject({ results: [], remaining: 4 });
    expect(mock.grant).toHaveBeenCalledTimes(2);
    const claims = await loadGameClaims(season.id, 'member');
    expect(claims.value.wayfarer.components.map((c) => c.status)).toEqual(['delivered', 'uncertain', 'pending']);
    expect(await claimAttention(season.id)).toEqual([
      expect.objectContaining({ owner: 'member', rewardId: 'wayfarer' }),
    ]);
    // The uncertainty stays quarantined: nothing can resend it, and the never-attempted component stays unsent.
    expect(mock.grant).toHaveBeenCalledTimes(2);
  });
  it('can retry safely after a failure that happened before anything was sent', async () => {
    const season = await setup();
    mock.balance.mockRejectedValueOnce(new Error('offline'));
    const first = await claimGameReward(season.id, 'member', 'wayfarer');
    expect(first.state).toBe('pending');
    expect(mock.grant).not.toHaveBeenCalled();
    expect((await claimGameReward(season.id, 'member', 'wayfarer')).state).toBe('claimed');
    expect(mock.grant).toHaveBeenCalledTimes(3);
  });
  it('parks an interrupted send as uncertain instead of resending', async () => {
    const season = await setup();
    mock.grant.mockImplementationOnce(async () => {
      throw new Error('process died');
    });
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow();
    const stuck = await loadGameClaims(season.id, 'member');
    expect(stuck.value.wayfarer.components[0].status).toBe('sending');
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow('in progress');
    stuck.value.wayfarer.components[0].attemptedAt = new Date(Date.now() - 300000).toISOString();
    await commit({
      id: season.id,
      actor: 'fixture',
      action: 'test.age',
      writes: [{ key: seasonKeys.gameClaims(season.id, 'member'), before: stuck.raw, after: stuck.value }],
    });
    mock.grant.mockClear();
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toThrow('administrator');
    expect(mock.grant).not.toHaveBeenCalled();
    expect((await loadGameClaims(season.id, 'member')).value.wayfarer.components[0].status).toBe('uncertain');
  });
  it('binds a season to one character and refuses another', async () => {
    const season = await setup();
    await claimGameReward(season.id, 'member', 'wayfarer');
    mock.linked.mockResolvedValue({ linked: true, pawnId: '99', controllerId: '98', onlineStatus: 'Offline' });
    await expect(claimGameReward(season.id, 'member', 'sandwalker')).rejects.toThrow('bound');
    expect(mock.grant).toHaveBeenCalledTimes(3);
  });
  it('claims everything unlocked in level order, in bounded batches, and keeps claims open after the season ends', async () => {
    const season = await setup(undefined, 24 * 100);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(season.definition.endsAt) + 1000);
    try {
      const batch = await claimAllAvailable(season.id, 'member');
      expect(batch.results.map((r) => r.rewardId)).toEqual([
        'wayfarer',
        'sandwalker',
        'spice-horizon',
        'desert-spire',
        'first-light',
      ]);
      expect(batch.results.every((r) => r.state === 'claimed')).toBe(true);
      expect(batch.remaining).toBe(0);
      expect(mock.grant).toHaveBeenCalledTimes(4);
      expect((await claimAllAvailable(season.id, 'member')).results).toHaveLength(0);
    } finally {
      clock.mockRestore();
    }
  });
  it('fails closed when delivery is not configured but still grants the dashboard cosmetic', async () => {
    const season = await setup();
    mock.enabled = false;
    await expect(claimGameReward(season.id, 'member', 'wayfarer')).rejects.toMatchObject({ statusCode: 503 });
    expect((await loadMember(season.id, 'member')).progress.value.claims.map((c) => c.reward.id)).toContain('wayfarer');
    expect(mock.grant).not.toHaveBeenCalled();
  });
  it('derives presentation state only from durable records', async () => {
    const season = await setup();
    const reward = season.definition.rewards[0];
    expect(claimState(season.definition, 0, season.definition.rewards[4], undefined)).toBe('locked');
    expect(claimState(season.definition, 700, reward, undefined)).toBe('available');
  });
});
