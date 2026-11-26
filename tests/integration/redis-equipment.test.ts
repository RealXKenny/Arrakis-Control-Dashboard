import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/player/server/equipment-store');
const planner = {
  loadouts: [
    {
      id: randomUUID(),
      name: 'Deep Desert run',
      purpose: 'exploration' as const,
      notes: 'Bring spare fuel.',
      items: [
        { templateId: 'Fuel_Cell', name: 'Fuel cell', quantity: '4', minGrade: null, minDurabilityPercent: null },
      ],
    },
  ],
  watchlist: [{ templateId: 'Stillsuit', name: 'Stillsuit', thresholdPercent: 30 }],
  filters: [],
  storageRules: [{ id: randomUUID(), containerLabel: 'Fuel', itemText: 'fuel' }],
};
const snapshot = (quantity: string) => ({
  id: randomUUID(),
  takenAt: new Date().toISOString(),
  complete: true,
  truncated: false,
  totals: [{ templateId: 'Water', name: 'Water', quantity, exact: true }],
});
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/player/server/equipment-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
describe('private equipment planner persistence', () => {
  it('isolates account and exact character pair with 90-day inactivity retention', async () => {
    const record = await store.savePlanner('user-a', '202', '101', null, planner);
    expect(await store.readPlanner('user-a', '202', '101')).toEqual(record);
    for (const [user, controller, player] of [
      ['user-b', '202', '101'],
      ['user-a', '303', '101'],
      ['user-a', '202', '909'],
    ])
      expect((await store.readPlanner(user, controller, player)).revision).toBeNull();
    const key = store.equipmentKey('planner', 'user-a', '202', '101');
    expect(key).not.toContain('user-a');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
    await direct.expire(key, 10);
    await store.readPlanner('user-a', '202', '101');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  });
  it('prevents concurrent lost updates and stale-tab overwrites', async () => {
    const record = await store.savePlanner('user', '202', '101', null, planner);
    const results = await Promise.allSettled([
      store.savePlanner('user', '202', '101', record.revision, { ...planner, watchlist: [] }),
      store.savePlanner('user', '202', '101', record.revision, { ...planner, storageRules: [] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({
      reason: { code: 'EQUIPMENT_CONFLICT' },
    });
    await expect(store.savePlanner('user', '202', '101', null, planner)).rejects.toMatchObject({
      code: 'EQUIPMENT_CONFLICT',
    });
  });
  it('fails closed on corrupt or invalid stored records', async () => {
    const key = store.equipmentKey('planner', 'user', '202', '101');
    for (const value of ['{bad', JSON.stringify({ revision: randomUUID(), planner: { ...planner, extra: true } })]) {
      await direct.set(key, value);
      await expect(store.readPlanner('user', '202', '101')).rejects.toMatchObject({ code: 'EQUIPMENT_UNAVAILABLE' });
    }
  });
  it('keeps only the newest six aggregate snapshots and clears with a retained revision fence', async () => {
    let record = await store.readHistory('user', '202', '101');
    for (let index = 0; index < 8; index++)
      record = await store.appendSnapshot('user', '202', '101', record.revision, snapshot(String(index)));
    expect(record.snapshots).toHaveLength(6);
    expect(record.snapshots[0].totals[0].quantity).toBe('2');
    await expect(store.appendSnapshot('user', '202', '101', null, snapshot('9'))).rejects.toMatchObject({
      code: 'EQUIPMENT_CONFLICT',
    });
    const cleared = await store.appendSnapshot('user', '202', '101', record.revision, null);
    expect(cleared.snapshots).toEqual([]);
    expect(await store.readHistory('user', '202', '101')).toEqual(cleared);
    expect((await store.readPlanner('user', '202', '101')).revision).toBeNull();
  });
});
