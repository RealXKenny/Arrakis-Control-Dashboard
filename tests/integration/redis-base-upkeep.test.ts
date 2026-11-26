import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/upkeep/server/store');
let samples: typeof import('../../src/features/upkeep/server/water-samples');
const owner = { userId: 'user-a', controller: '202', player: '101' };
const settings = {
  baseId: '11',
  waterAlertPercent: 20,
  generatorAlertHours: null,
  inspectEveryDays: 3,
  minimums: [{ templateId: 'Water', name: 'Water', minimum: '999999999999' }],
  checklist: [],
};
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/upkeep/server/store');
  samples = await import('../../src/features/upkeep/server/water-samples');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('private base upkeep persistence', () => {
  it('isolates account and character with 90-day inactivity retention and exact decimal strings', async () => {
    const saved = await store.mutateUpkeep(owner, null, { action: 'base', revision: null, base: settings });
    expect(await store.readUpkeep(owner)).toEqual(saved);
    expect(saved.bases[0].minimums[0].minimum).toBe('999999999999');
    expect((await store.readUpkeep({ ...owner, userId: 'user-b' })).revision).toBeNull();
    expect((await store.readUpkeep({ ...owner, player: '909' })).revision).toBeNull();
    const key = store.upkeepKey(owner);
    expect(key).not.toContain('user-a');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
    await direct.expire(key, 10);
    await store.readUpkeep(owner);
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  });
  it('prevents concurrent lost updates and stale overwrites', async () => {
    const first = await store.mutateUpkeep(owner, null, { action: 'base', revision: null, base: settings });
    const results = await Promise.allSettled([
      store.mutateUpkeep(owner, first.revision, { action: 'base-remove', revision: first.revision, baseId: '11' }),
      store.mutateUpkeep(owner, first.revision, {
        action: 'base',
        revision: first.revision,
        base: { ...settings, waterAlertPercent: 40 },
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(
      store.mutateUpkeep(owner, first.revision, { action: 'base-remove', revision: first.revision, baseId: '11' }),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      store.mutateUpkeep(owner, null, { action: 'base', revision: null, base: settings }),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it('fails closed on corrupt or oversized stored records', async () => {
    await direct.set(store.upkeepKey(owner), '{"revision":"x"}');
    await expect(store.readUpkeep(owner)).rejects.toMatchObject({ statusCode: 503 });
    await direct.set(store.upkeepKey(owner), 'x'.repeat(256 * 1024 + 1));
    await expect(store.readUpkeep(owner)).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('observed water samples', () => {
  it('throttles to one sample per interval, keeps unknown readings and expires with bounded retention', async () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    expect(await samples.recordWaterSample(owner, '11', 55.55, now)).toBe(true);
    expect(await samples.recordWaterSample(owner, '11', 54, now + 60_000)).toBe(false);
    expect(await samples.recordWaterSample(owner, '11', null, now + 11 * 60_000)).toBe(true);
    expect(await samples.readWaterSamples(owner, '11', now + 12 * 60_000)).toEqual([
      { t: new Date(now).toISOString(), percent: 55.6 },
      { t: new Date(now + 11 * 60_000).toISOString(), percent: null },
    ]);
    expect(await samples.readWaterSamples({ ...owner, userId: 'user-b' }, '11', now)).toEqual([]);
    const key = samples.waterSamplesKey(owner, '11');
    expect(await direct.ttl(key)).toBeGreaterThan(13 * 86400);
    expect(await samples.readWaterSamples(owner, '11', now + 8 * 86_400_000)).toEqual([]);
  });
  it('trims history to the sample limit', async () => {
    const start = Date.parse('2026-11-20T00:00:00Z');
    for (let index = 0; index < 1010; index += 1)
      await samples.recordWaterSample(owner, '11', 50, start + index * 11 * 60_000);
    expect(await direct.llen(samples.waterSamplesKey(owner, '11'))).toBe(1008);
  });
});
