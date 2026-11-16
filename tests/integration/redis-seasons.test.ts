import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { seasonTemplate } from '../../src/features/seasons/contracts';
// Request-scoped helpers (client address, budgets) have no request here; Redis behavior is what is under test.
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: async () => ({ allowed: true }) }));
const deliveryMock = vi.hoisted(() => ({ grant: vi.fn().mockResolvedValue('delivered') }));
vi.mock('../../src/features/player/server/linked-player', () => ({
  getLinkedPlayer: async () => ({ linked: true, pawnId: '42', controllerId: '43', onlineStatus: 'Offline' }),
}));
const game = vi.hoisted(() => ({ xp: 9_000_000, level: 100, nodes: [{ id: 'Story.Old', complete: true }] }));
vi.mock('../../src/server/integrations/dune', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/server/integrations/dune')>()),
  getDuneClient: () => ({
    request: async (_method: string, path: string) => {
      const player = { actorId: '42', controllerId: '43' };
      if (path.endsWith('/progression'))
        return { capabilities: { progression: true }, player, level: game.level, xp: game.xp };
      return {
        capabilities: { journey: true },
        player,
        rows: { story: game.nodes, contract: [], codex: [], tutorial: [] },
      };
    },
  }),
}));
vi.mock('../../src/features/seasons/server/delivery-gateway', () => ({
  deliveryAvailable: () => true,
  currencyOf: (r: { type: string }) => (r.type === 'solaris' || r.type === 'house-credits' ? r.type : null),
  offline: (v: unknown) => v === 'Offline',
  deliveryGateway: { balance: async () => 1000n, grant: deliveryMock.grant },
}));
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let engine: typeof import('../../src/features/seasons/server/engine');
let store: typeof import('../../src/features/seasons/server/store');
let generator: typeof import('../../src/features/seasons/server/generator');
beforeAll(async () => {
  direct = connectDirect(target);
  engine = await import('../../src/features/seasons/server/engine');
  store = await import('../../src/features/seasons/server/store');
  generator = await import('../../src/features/seasons/server/generator');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
async function active() {
  const definition = seasonTemplate();
  definition.startsAt = new Date(Date.now() - 3600000).toISOString();
  const draft = await engine.saveSeason(randomUUID(), '', definition, 'admin');
  return engine.transitionSeason(draft.id, draft.revision, 'publish', 'admin');
}
it('coordinates automatic season publication, bulk cosmetic ownership and rollover through real single-slot Lua', async () => {
  await generator.configureGenerator(
    '',
    { firstNumber: 1, firstStart: new Date(Date.now() - 60000).toISOString(), timezone: 'UTC' },
    'admin',
  );
  await Promise.allSettled([generator.runGenerator(), generator.runGenerator()]);
  await generator.runGenerator();
  let seasons = await store.listSeasons(0, true);
  expect(seasons).toHaveLength(2);
  expect((await generator.generatorStatus()).enabled).toBe(true);
  const first = seasons.find((s) => s.definition.number === 1)!;
  const proofs = new Map(first.definition.challenges.map((c) => [c.id, 'Verified disposable provider observation.']));
  await Promise.allSettled([
    engine.syncAutomaticProgress(first.id, 'member', proofs),
    engine.syncAutomaticProgress(first.id, 'member', proofs),
  ]);
  const progress = (await store.loadMember(first.id, 'member')).progress.value;
  expect(progress.ledger).toHaveLength(100);
  expect(progress.claims).toHaveLength(100);
  expect(progress.xp).toBe(250000);
  expect((await engine.syncAutomaticProgress(first.id, 'member', proofs)).duplicate).toBe(true);
  const clock = vi.spyOn(Date, 'now').mockReturnValue(Date.parse(first.definition.endsAt));
  try {
    await generator.runGenerator();
    seasons = await store.listSeasons(0, true);
    expect((await store.loadSeason(first.id)).value.phase).toBe('archived');
    expect(seasons).toHaveLength(3);
    expect(
      (await store.loadMember(seasons.find((s) => s.definition.number === 2)!.id, 'member')).progress.value.xp,
    ).toBe(0);
  } finally {
    clock.mockRestore();
  }
  expect((await store.loadMember(first.id, 'member')).progress.value.claims).toEqual(progress.claims);
  expect(await direct.ttl(store.seasonKeys.season(first.id))).toBe(-1);
});
it('executes atomic single-slot publication and prevents simultaneous overlapping seasons', async () => {
  const first = await active();
  const definition = { ...first.definition, number: 2, slug: 'season-two' };
  const draft = await engine.saveSeason(randomUUID(), '', definition, 'admin');
  await expect(engine.transitionSeason(draft.id, draft.revision, 'publish', 'admin')).rejects.toThrow('overlap');
  expect(await direct.zcard(store.seasonKeys.published)).toBe(1);
  expect(await direct.ttl(store.seasonKeys.season(first.id))).toBe(-1);
});
it('checks Redis commit-time deadlines and fails before writing any records on corruption', async () => {
  const season = await active();
  const key = store.seasonKeys.progress(season.id, 'member');
  await expect(
    store.commit({
      id: season.id,
      actor: 'member',
      action: 'test.deadline',
      active: [0, 1],
      writes: [{ key, before: '', after: { xp: 100 } }],
    }),
  ).rejects.toThrow('no longer');
  expect(await direct.get(key)).toBeNull();
  await direct.set(store.seasonKeys.audit(season.id), 'wrong-type');
  await expect(engine.claimReward(season.id, 'member', 'wayfarer')).rejects.toThrow();
  expect(await direct.get(key)).toBeNull();
});
it('preserves the prior season and cosmetics while a new season starts independently', async () => {
  let season = await active();
  await engine.claimReward(season.id, 'member', 'wayfarer');
  await engine.equipReward(season.id, 'member', 'wayfarer');
  season = await engine.transitionSeason(season.id, season.revision, 'end', 'admin');
  await engine.transitionSeason(season.id, season.revision, 'archive', 'admin');
  const draft = await engine.saveSeason(
    randomUUID(),
    '',
    { ...season.definition, number: 2, slug: 'second-season' },
    'admin',
  );
  await engine.transitionSeason(draft.id, draft.revision, 'publish', 'admin');
  expect((await store.loadMember(draft.id, 'member')).progress.value.claims).toEqual([]);
  expect((await store.loadMember(season.id, 'member')).progress.value.claims).toHaveLength(1);
  expect(await direct.get(store.seasonKeys.equipment('member'))).toContain('wayfarer');
});
const member = {
  user: { id: 'member', username: 'Member' },
  guildId: 'guild',
  roleIds: [],
  expiresAt: Date.now() + 3600000,
};
async function automaticSeason() {
  await generator.configureGenerator(
    '',
    { firstNumber: 1, firstStart: new Date(Date.now() - 60000).toISOString(), timezone: 'UTC' },
    'admin',
  );
  await generator.runGenerator();
  await generator.runGenerator();
  return (await store.listSeasons(0, true)).find((s) => s.definition.number === 1)!;
}
it('gives a level-100 player zero XP at first capture, then counts only new progress exactly once through real CAS', async () => {
  const { syncSeasonObjectives } = await import('../../src/features/seasons/server/observations');
  game.xp = 9_000_000;
  game.level = 100;
  game.nodes = [{ id: 'Story.Old', complete: true }];
  const first = await automaticSeason();
  const signal = new AbortController().signal;
  await Promise.allSettled([1, 2, 3].map(() => syncSeasonObjectives(member, first.id, signal)));
  const baseline = JSON.parse((await direct.get(store.seasonKeys.baseline(first.id, 'member'))) ?? 'null');
  expect(baseline).toMatchObject({ pawn: '42', controller: '43', xp: '9000000', highXp: '9000000', level: 100 });
  expect((await store.loadMember(first.id, 'member')).progress.value.xp).toBe(0);
  // A decreased counter fails closed and cannot rebase the stored baseline.
  game.xp = 8_000_000;
  await expect(syncSeasonObjectives(member, first.id, signal)).rejects.toThrow('decreased');
  expect(JSON.parse((await direct.get(store.seasonKeys.baseline(first.id, 'member')))!).xp).toBe('9000000');
  game.xp = 9_020_000;
  game.nodes = [
    { id: 'Story.Old', complete: false },
    { id: 'Story.Brand.New', complete: true },
  ];
  await syncSeasonObjectives(member, first.id, signal);
  const gained = (await store.loadMember(first.id, 'member')).progress.value;
  expect(gained.xp).toBeGreaterThan(0);
  expect(new Set(gained.ledger.map((v) => v.id)).size).toBe(gained.ledger.length);
  const again = await syncSeasonObjectives(member, first.id, signal);
  expect(again.duplicate).toBe(true);
  expect((await store.loadMember(first.id, 'member')).progress.value.xp).toBe(gained.xp);
});
it('starts the next season at zero and keeps earlier recognition permanent', async () => {
  const { syncSeasonObjectives } = await import('../../src/features/seasons/server/observations');
  game.xp = 5_000;
  game.level = 100;
  game.nodes = [];
  const first = await automaticSeason();
  const signal = new AbortController().signal;
  await syncSeasonObjectives(member, first.id, signal);
  game.xp = 5_000 + 20_000;
  await syncSeasonObjectives(member, first.id, signal);
  const earned = (await store.loadMember(first.id, 'member')).progress.value;
  expect(earned.xp).toBeGreaterThan(0);
  // Redis checks the season window with its own clock, so Season 2 cannot be entered early; prove independence by key.
  await generator.runGenerator();
  const second = (await store.listSeasons(0, true)).find((s) => s.definition.number === 2)!;
  expect(second.id).not.toBe(first.id);
  expect(store.seasonKeys.baseline(second.id, 'member')).not.toBe(store.seasonKeys.baseline(first.id, 'member'));
  expect(await direct.get(store.seasonKeys.baseline(second.id, 'member'))).toBeNull();
  expect((await store.loadMember(second.id, 'member')).progress.value.xp).toBe(0);
  expect((await store.loadMember(first.id, 'member')).progress.value).toEqual(earned);
});
it('delivers a claimed bundle exactly once under concurrent clicks, parks uncertainty and never resends', async () => {
  const claims = await import('../../src/features/seasons/server/claims');
  const definition = seasonTemplate();
  definition.startsAt = new Date(Date.now() - 3600000).toISOString();
  definition.rewards[0].bundle = [
    { type: 'solaris', amount: '100' },
    { type: 'item', itemId: 'IronOre', quantity: 12, quality: 0 },
  ];
  const draft = await engine.saveSeason(randomUUID(), '', definition, 'admin');
  const season = await engine.transitionSeason(draft.id, draft.revision, 'publish', 'admin');
  const unlocked = await store.loadMember(season.id, 'member');
  unlocked.progress.value.xp = 700;
  unlocked.progress.value.ledger = [
    { id: randomUUID(), delta: 700, reason: 'Fixture', at: new Date().toISOString(), actor: 'fixture' },
  ];
  await store.commit({
    id: season.id,
    actor: 'fixture',
    action: 'test.progress',
    writes: [
      { key: store.seasonKeys.season(season.id), before: unlocked.season.raw },
      {
        key: store.seasonKeys.progress(season.id, 'member'),
        before: unlocked.progress.raw,
        after: unlocked.progress.value,
      },
    ],
  });
  deliveryMock.grant.mockClear();
  await Promise.allSettled(Array.from({ length: 8 }, () => claims.claimGameReward(season.id, 'member', 'wayfarer')));
  expect(deliveryMock.grant).toHaveBeenCalledTimes(2);
  const record = (await claims.loadGameClaims(season.id, 'member')).value.wayfarer;
  expect(record.components.map((c) => c.status)).toEqual(['delivered', 'delivered']);
  expect(await direct.ttl(store.seasonKeys.gameClaims(season.id, 'member'))).toBe(-1);
  expect((await claims.claimGameReward(season.id, 'member', 'wayfarer')).state).toBe('claimed');
  expect(deliveryMock.grant).toHaveBeenCalledTimes(2);
});
