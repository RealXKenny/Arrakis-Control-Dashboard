import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/player/server/item-pins-store');
const pin = { templateId: 'Spice_Template', name: 'Spice Melange' };
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/player/server/item-pins-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
describe('private item pin persistence', () => {
  it('isolates both account and character with bounded inactivity retention', async () => {
    const record = await store.saveItemPins('user-a', '202', '101', null, [pin]);
    expect(await store.readItemPins('user-a', '202', '101')).toEqual(record);
    expect(await store.readItemPins('user-b', '202', '101')).toEqual({ revision: null, pins: [] });
    expect(await store.readItemPins('user-a', '303', '101')).toEqual({ revision: null, pins: [] });
    expect(await store.readItemPins('user-a', '202', '909')).toEqual({ revision: null, pins: [] });
    const key = store.itemPinsKey('user-a', '202', '101');
    expect(key).not.toContain('user-a');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
    await direct.expire(key, 10);
    await store.readItemPins('user-a', '202', '101');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  });
  it('prevents concurrent lost updates and stale overwrites', async () => {
    const record = await store.saveItemPins('user', '202', '101', null, [pin]);
    const results = await Promise.allSettled([
      store.saveItemPins('user', '202', '101', record.revision, []),
      store.saveItemPins('user', '202', '101', record.revision, [{ templateId: 'Water', name: 'Water' }]),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: { code: 'PIN_CONFLICT' } });
    await expect(store.saveItemPins('user', '202', '101', record.revision, [pin])).rejects.toMatchObject({
      code: 'PIN_CONFLICT',
    });
  });
  it('retains an empty revision so a stale tab cannot restore removed pins', async () => {
    const record = await store.saveItemPins('user', '202', '101', null, [pin]);
    const empty = await store.saveItemPins('user', '202', '101', record.revision, []);
    expect(empty.revision).not.toBe(record.revision);
    await expect(store.saveItemPins('user', '202', '101', null, [pin])).rejects.toMatchObject({ code: 'PIN_CONFLICT' });
    expect(await store.readItemPins('user', '202', '101')).toEqual(empty);
  });
  it('fails closed on oversized, corrupt or invalid stored records', async () => {
    const key = store.itemPinsKey('user', '202', '101');
    for (const value of ['x'.repeat(8193), '{bad', JSON.stringify({ revision: randomUUID(), pins: [pin, pin] })]) {
      await direct.set(key, value);
      await expect(store.readItemPins('user', '202', '101')).rejects.toMatchObject({ code: 'PINS_UNAVAILABLE' });
      await expect(store.saveItemPins('user', '202', '101', null, [])).rejects.toMatchObject({
        code: 'PINS_UNAVAILABLE',
      });
    }
  });
  it('bounds saved records and does not silently persist duplicate or extra pins', async () => {
    await expect(store.saveItemPins('user', '202', '101', null, [pin, pin])).rejects.toMatchObject({
      code: 'INVALID_PINS',
    });
    await expect(
      store.saveItemPins(
        'user',
        '202',
        '101',
        null,
        Array.from({ length: 13 }, (_, i) => ({ ...pin, templateId: String(i) })),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_PINS' });
    expect(await store.readItemPins('user', '202', '101')).toEqual({ revision: null, pins: [] });
  });
});
