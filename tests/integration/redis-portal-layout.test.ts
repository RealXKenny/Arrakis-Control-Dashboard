import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { personalPortalLayout, recommendedPortalLayout } from '../../src/features/portal/layout';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/portal/server/layout-store');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/portal/server/layout-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
it('isolates account preferences and retains them across clients without needing a character or guild', async () => {
  const record = await store.savePortalLayout('member-a', null, personalPortalLayout());
  expect(await store.readPortalLayout('member-a')).toEqual(record);
  expect(await store.readPortalLayout('member-b')).toBeNull();
  const key = store.portalLayoutKey('member-a');
  expect(key).not.toContain('member-a');
  expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  await direct.expire(key, 10);
  await store.readPortalLayout('member-a');
  expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
});
it('fences simultaneous first saves and stale updates through real single-key Lua CAS', async () => {
  const first = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.savePortalLayout('member', null, personalPortalLayout())),
  );
  expect(first.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  const old = (await store.readPortalLayout('member'))!;
  const updated = await Promise.allSettled([
    store.savePortalLayout('member', old.revision, recommendedPortalLayout(true)),
    store.savePortalLayout('member', old.revision, { ...old.layout, widgets: [] }),
  ]);
  expect(updated.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  await expect(store.savePortalLayout('member', old.revision, old.layout)).rejects.toMatchObject({
    code: 'PORTAL_LAYOUT_CONFLICT',
  });
});
it('retains an empty layout revision so an older tab cannot silently restore defaults', async () => {
  const saved = await store.savePortalLayout('member', null, { ...personalPortalLayout(), widgets: [] });
  expect((await store.readPortalLayout('member'))?.layout.widgets).toEqual([]);
  await expect(store.savePortalLayout('member', null, personalPortalLayout())).rejects.toMatchObject({
    statusCode: 409,
  });
  expect((await store.readPortalLayout('member'))?.revision).toBe(saved.revision);
});
it('refuses corrupt or oversized stored records and invalid configuration without overwriting them', async () => {
  const key = store.portalLayoutKey('member');
  for (const raw of [
    '{bad',
    'x'.repeat(4097),
    JSON.stringify({ revision: randomUUID(), layout: { ...personalPortalLayout(), widgets: ['foreign'] } }),
  ]) {
    await direct.set(key, raw);
    await expect(store.readPortalLayout('member')).rejects.toMatchObject({ statusCode: 503 });
    await expect(store.savePortalLayout('member', null, personalPortalLayout())).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(await direct.get(key)).toBe(raw);
  }
  await direct.del(key);
  await direct.lpush(key, 'wrong-type');
  await expect(store.readPortalLayout('member')).rejects.toMatchObject({ statusCode: 503 });
});
