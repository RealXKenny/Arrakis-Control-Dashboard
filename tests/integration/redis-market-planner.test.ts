import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { emptyPlanner, type Planner } from '../../src/features/market/planner';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/market/server/planner-store');
const watch = {
  id: randomUUID(),
  templateId: 'Water',
  name: 'Water',
  grade: null,
  below: '10',
  above: null,
  cooldownMinutes: 60 as const,
};
const planner: Planner = { ...emptyPlanner(), watches: [watch] };

beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/market/server/planner-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('private market planner persistence', () => {
  it('isolates accounts with hashed keys and 90-day inactivity retention', async () => {
    const record = await store.savePlanner('user-a', null, planner);
    expect(await store.readPlanner('user-a')).toEqual(record);
    expect(await store.readPlanner('user-b')).toEqual({ revision: null, planner: emptyPlanner() });
    const key = store.plannerKey('user-a');
    expect(key).not.toContain('user-a');
    await direct.expire(key, 10);
    await store.readPlanner('user-a');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86_400);
  });
  it('prevents concurrent lost updates and stale overwrites', async () => {
    const record = await store.savePlanner('user', null, planner);
    const results = await Promise.allSettled([
      store.savePlanner('user', record.revision, emptyPlanner()),
      store.savePlanner('user', record.revision, { ...planner, budget: '5' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(store.savePlanner('user', record.revision, planner)).rejects.toMatchObject({
      code: 'PLANNER_CONFLICT',
    });
    await expect(store.savePlanner('user', null, planner)).rejects.toMatchObject({ code: 'PLANNER_CONFLICT' });
  });
  it('fails closed on corrupt or oversized records instead of returning an empty planner', async () => {
    const key = store.plannerKey('user');
    for (const value of [
      'x'.repeat(16_385),
      '{bad',
      JSON.stringify({ revision: randomUUID(), planner: { nope: 1 } }),
    ]) {
      await direct.set(key, value);
      await expect(store.readPlanner('user')).rejects.toMatchObject({ code: 'PLANNER_UNAVAILABLE' });
    }
  });
  it('keeps a bounded, de-duplicated private search history that can be cleared', async () => {
    for (const query of ['water', 'spice', 'water', ...Array.from({ length: 12 }, (_, n) => `item ${n}`)])
      await store.recordSearch('user', query);
    const searches = await store.readSearches('user');
    expect(searches).toHaveLength(10);
    expect(searches[0]).toBe('item 11');
    expect(searches.filter((entry) => entry === 'water')).toHaveLength(0);
    expect(await store.readSearches('other')).toEqual([]);
    await store.clearSearches('user');
    expect(await store.readSearches('user')).toEqual([]);
  });
  it('stores alert cooldowns separately and tolerates damage', async () => {
    const states = { [watch.id]: { condition: 'below' as const, notifiedAt: new Date().toISOString() } };
    expect(await store.writeAlertStates('user', states)).toBe(true);
    expect(await store.readAlertStates('user')).toEqual(states);
    await direct.set(store.alertsKey('user'), '{bad');
    expect(await store.readAlertStates('user')).toEqual({});
  });
  it('samples observed prices at most every ten minutes and caps each series', async () => {
    const base = Date.parse('2026-11-26T00:00:00Z');
    const point = (offset: number) => ({
      at: new Date(base + offset).toISOString(),
      lowest: '10',
      stock: '5',
      orders: 2,
    });
    expect(await store.recordPricePoint('Water', null, point(0))).toBe('ok');
    expect(await store.recordPricePoint('Water', null, point(60_000))).toBe('skip');
    expect(await store.recordPricePoint('Water', null, point(store.PRICE_SAMPLE_INTERVAL_MS))).toBe('ok');
    expect(await store.recordPricePoint('Water', 2, point(0))).toBe('ok');
    const { points } = await store.readPricePoints('water', null);
    expect(points.map((entry) => entry.at)).toEqual([point(0).at, point(store.PRICE_SAMPLE_INTERVAL_MS).at]);
    expect(await direct.ttl(store.priceKey('Water', null))).toBeGreaterThan(29 * 86_400);
    for (let n = 2; n < store.PRICE_POINT_LIMIT + 5; n += 1)
      await store.recordPricePoint('Water', null, point(n * store.PRICE_SAMPLE_INTERVAL_MS));
    expect(await direct.llen(store.priceKey('Water', null))).toBe(store.PRICE_POINT_LIMIT);
    await direct.lpush(store.priceKey('Water', null), '{bad');
    expect((await store.readPricePoints('Water', null)).rejected).toBe(1);
  });
});
