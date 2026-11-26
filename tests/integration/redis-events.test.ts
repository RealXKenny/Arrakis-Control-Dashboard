import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { firstCommunityEvent } from '../../src/features/events/contracts';

// The shared guard accepts only an explicitly selected disposable loopback Redis.
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/events/server/store');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/events/server/store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
describe('persistent community events', () => {
  it('seeds once, preserves edits and never resurrects a deleted seed', async () => {
    const [seed] = await store.listCommunityEvents();
    expect(seed.prizeSolaris).toBe(500000);
    await store.saveCommunityEvent(seed.id, { ...seed, title: 'Changed title' }, seed.revision);
    expect((await store.listCommunityEvents())[0].title).toBe('Changed title');
    await store.deleteCommunityEvent(seed.id, seed.revision + 1);
    expect(await store.listCommunityEvents()).toEqual([]);
    expect(await direct.hget('arrakis:{community-events}:records', '__seeded')).toBe('1');
  });
  it('keeps drafts private and prevents two edits from silently overwriting each other', async () => {
    const [seed] = await store.listCommunityEvents();
    const results = await Promise.allSettled([
      store.saveCommunityEvent(seed.id, { ...seed, title: 'Edit one' }, seed.revision),
      store.saveCommunityEvent(seed.id, { ...seed, title: 'Edit two' }, seed.revision),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await store.saveCommunityEvent('draft-event', { ...firstCommunityEvent(), visibility: 'draft' }, 0);
    expect((await store.listCommunityEvents()).some((event) => event.id === 'draft-event')).toBe(false);
    expect((await store.listCommunityEvents(true)).some((event) => event.id === 'draft-event')).toBe(true);
  });
});
