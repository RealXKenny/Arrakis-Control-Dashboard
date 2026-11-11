import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { seasonTemplate } from '../../src/features/seasons/contracts';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let engine: typeof import('../../src/features/seasons/server/engine');
let store: typeof import('../../src/features/seasons/server/store');
beforeAll(async () => {
  direct = connectDirect(target);
  engine = await import('../../src/features/seasons/server/engine');
  store = await import('../../src/features/seasons/server/store');
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
it('executes atomic single-slot publication and prevents simultaneous overlapping seasons', async () => {
  const first = await active();
  const definition = { ...first.definition, number: 2, slug: 'season-two' };
  const draft = await engine.saveSeason(randomUUID(), '', definition, 'admin');
  await expect(engine.transitionSeason(draft.id, draft.revision, 'publish', 'admin')).rejects.toThrow('overlap');
  expect(await direct.zcard(store.seasonKeys.published)).toBe(1);
  expect(await direct.ttl(store.seasonKeys.season(first.id))).toBe(-1);
});
it('settles a concurrent review and claim once with permanent ownership and an append-only audit', async () => {
  const season = await active();
  const result = await engine.submitChallenge(season.id, 'member', 'solo-contribution', {
    text: 'Verified disposable test evidence.',
    links: [],
    requestId: randomUUID(),
  });
  const submissionId = result.progress.submissions[0].id;
  await Promise.allSettled(
    Array.from({ length: 8 }, () =>
      engine.reviewSubmission(season.id, 'member', submissionId, true, 'Approved evidence.', 'admin'),
    ),
  );
  await Promise.allSettled(Array.from({ length: 8 }, () => engine.claimReward(season.id, 'member', 'first-light')));
  const data = await store.loadMember(season.id, 'member');
  expect(data.progress.value.xp).toBe(700);
  expect(data.progress.value.ledger).toHaveLength(1);
  expect(data.progress.value.claims).toHaveLength(1);
  expect(data.totals.value).toMatchObject({ completions: 1, claims: 1, xp: 700 });
  await engine.equipReward(season.id, 'member', 'first-light');
  expect(await direct.ttl(store.seasonKeys.equipment('member'))).toBe(-1);
  expect(await direct.hlen(store.seasonKeys.inbox(season.id))).toBe(0);
  expect(await direct.llen(store.seasonKeys.audit(season.id))).toBeGreaterThanOrEqual(6);
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
it('commits live presentation snapshots atomically, preserves frozen definitions and rejects expired edit commits', async () => {
  const { savePresentation } = await import('../../src/features/seasons/server/artwork');
  const { seasonPresentation } = await import('../../src/features/seasons/contracts');
  const season = await active();
  const presentation = { ...seasonPresentation(season), subtitle: 'An audited live presentation' };
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      savePresentation(season.id, season.revision, presentation, 'Correct the live season introduction.', 'admin'),
    ),
  );
  expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  const current = (await store.loadSeason(season.id)).value;
  expect(current.definition).toEqual(season.definition);
  expect(current.presentation.subtitle).toBe(presentation.subtitle);
  expect(await direct.exists(store.seasonKeys.presentationSnapshot(season.id, current.revision))).toBe(1);
  const key = store.seasonKeys.progress(season.id, 'never-written');
  await expect(
    store.commit({
      id: season.id,
      actor: 'admin',
      action: 'test.expired-edit',
      beforeDeadline: 1,
      writes: [{ key, before: '', after: {} }],
    }),
  ).rejects.toThrow('no longer');
  expect(await direct.get(key)).toBeNull();
});
