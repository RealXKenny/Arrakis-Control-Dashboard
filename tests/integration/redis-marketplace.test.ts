import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

/**
 * Runs the marketplace publish/delete Lua scripts against a REAL Redis (never production).
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6390/15 npm run test:integration
 *
 * The database named in the URL is flushed before every test, so point it at a throwaway instance.
 */
const target = integrationTarget();
configureApplication(target);
process.env.AUTH_SECRET = 'integration-secret-integration-secret-0001';
process.env.OWNER_KEY_SECRET = 'integration-owner-secret-integration-0002';
vi.mock('../../src/lib/assert-server', () => ({}));

const NS = 'arrakis:{bm}:v2';
let direct: Redis;
let market: typeof import('../../src/features/bases/server/marketplace');
type PublishRecord = Parameters<(typeof market)['publishBase']>[0];

const id = (n: number) => n.toString(16).padStart(24, '0');
const owner = (n: number) => n.toString(16).padStart(16, '0');
const keys = (listing: string, ownerKey: string) => ({
  record: `${NS}:record:${listing}`,
  state: `${NS}:state:${listing}`,
  owner: `${NS}:owner:${listing}`,
  image: `${NS}:image:${listing}`,
  size: `${NS}:size:${listing}`,
  count: `${NS}:user:${ownerKey}`,
  bytes: `${NS}:bytes:${ownerKey}`,
  total: `${NS}:bytes-total`,
  index: `${NS}:index`,
});

function listing(n: number, ownerKey: string, padding = 0): PublishRecord {
  return {
    summary: {
      id: id(n),
      title: `Base ${n}`,
      author: 'Tester',
      baseType: 'Outpost',
      map: 'Hagga',
      pieceCount: 1,
      placeableCount: 0,
      publishedAt: new Date(1_700_000_000_000 + n * 1000).toISOString(),
      hasThumbnail: false,
      ownerKey,
    },
    layout: {
      name: 'x'.repeat(padding),
      instances: [{ building_type: 'BP_Wall', x: 0, y: 0, z: 0 }],
      placeables: [],
      pentashields: [],
    },
  } as unknown as PublishRecord;
}

async function dump() {
  const out: Record<string, unknown> = {};
  for (const key of (await direct.keys('*')).sort()) {
    const type = await direct.type(key);
    out[key] = type === 'zset' ? await direct.zrange(key, 0, -1, 'WITHSCORES') : await direct.get(key);
  }
  return out;
}
const num = async (key: string) => Number((await direct.get(key)) ?? 0);

beforeAll(async () => {
  direct = connectDirect(target);
  market = await import('../../src/features/bases/server/marketplace');
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  await direct.flushdb();
});

describe('script basics on a real Redis', () => {
  it('server supports EVAL and the scripts compile', async () => {
    const outcome = await market.publishBase(listing(1, owner(1)), null);
    expect(outcome).toBe('ok');
    expect(await direct.zcard(`${NS}:index`)).toBe(1);
  });

  it('publish records the count, the stored bytes and a per-listing size, consistently', async () => {
    const record = listing(1, owner(1), 5000);
    const image = { type: 'image/png' as const, base64: 'QUJD' };
    await market.publishBase(record, image);
    const k = keys(id(1), owner(1));
    const expected = Buffer.byteLength(JSON.stringify(record)) + Buffer.byteLength(JSON.stringify(image));
    expect(await num(k.count)).toBe(1);
    expect(await num(k.bytes)).toBe(expected);
    expect(await num(k.total)).toBe(expected);
    expect(await num(k.size)).toBe(expected);
    expect(await direct.get(k.owner)).toBe(owner(1));
  });

  it('delete gives back exactly what publish took and leaves no counters behind', async () => {
    await market.publishBase(listing(1, owner(1), 3000), null);
    expect(await market.deleteBase(id(1), [owner(1), owner(99)])).toBe(true);
    expect(await dump()).toEqual({});
  });

  it('only the owner can delete, and a refused delete changes nothing', async () => {
    await market.publishBase(listing(1, owner(1), 100), null);
    const before = await dump();
    expect(await market.deleteBase(id(1), [owner(2), owner(3)])).toBe(false);
    expect(await dump()).toEqual(before);
    expect(await market.deleteBase('not-an-id', [owner(1), owner(99)])).toBe(false);
  });

  it('a duplicate publish of the same listing ID is refused and changes nothing', async () => {
    await market.publishBase(listing(1, owner(1), 100), null);
    const once = await dump();
    await expect(market.publishBase(listing(1, owner(1), 100), null)).rejects.toMatchObject({
      statusCode: 409,
      code: 'ALREADY_PUBLISHED',
    });
    expect(await dump()).toEqual(once);
  });
});

describe('quotas', () => {
  it('stops at the per-member listing cap and a refused publish writes nothing', async () => {
    for (let n = 1; n <= market.MAX_LISTINGS_PER_USER; n += 1)
      expect(await market.publishBase(listing(n, owner(1)), null)).toBe('ok');
    const before = await dump();
    expect(await market.publishBase(listing(1000, owner(1)), null)).toBe('user-limit');
    expect(await dump()).toEqual(before);
  });

  it('stops at the per-member byte quota with real data, then frees room when a listing is deleted', async () => {
    const chunk = 1_500_000;
    let published = 0;
    for (let n = 1; n <= 40; n += 1) {
      const outcome = await market.publishBase(listing(n, owner(1), chunk), null);
      if (outcome === 'storage-limit') break;
      expect(outcome).toBe('ok');
      published += 1;
    }
    const k = keys(id(1), owner(1));
    expect(published).toBe(Math.floor(market.MAX_BYTES_PER_USER / (chunk + 400)));
    expect(await num(k.bytes)).toBeLessThanOrEqual(market.MAX_BYTES_PER_USER);
    const before = await dump();
    expect(await market.publishBase(listing(900, owner(1), chunk), null)).toBe('storage-limit');
    expect(await dump()).toEqual(before);

    expect(await market.deleteBase(id(1), [owner(1), owner(99)])).toBe(true);
    expect(await market.publishBase(listing(901, owner(1), chunk), null)).toBe('ok');
  }, 60_000);

  it('another member keeps their own byte quota when one member is full', async () => {
    for (let n = 1; n <= 20; n += 1)
      if ((await market.publishBase(listing(n, owner(1), 1_500_000), null)) !== 'ok') break;
    expect(await market.publishBase(listing(500, owner(2), 1_500_000), null)).toBe('ok');
  }, 60_000);

  it('enforces the global byte limit across members', async () => {
    await direct.set(`${NS}:bytes-total`, String(market.MAX_BYTES_TOTAL - 100));
    expect(await market.publishBase(listing(1, owner(1), 5000), null)).toBe('full');
    expect(await direct.exists(keys(id(1), owner(1)).record)).toBe(0);
    expect(await market.publishBase(listing(2, owner(1), 0), null)).toBe('full'); // even a minimal record is larger than 100 bytes
    await direct.set(`${NS}:bytes-total`, String(market.MAX_BYTES_TOTAL - 10_000_000));
    expect(await market.publishBase(listing(3, owner(1), 5000), null)).toBe('ok');
  });

  it('stops at the marketplace-wide listing cap', async () => {
    const { BASE_LISTING_LIMIT } = await import('../../src/features/bases/schema');
    const pipeline = direct.pipeline();
    for (let n = 0; n < BASE_LISTING_LIMIT; n += 1) pipeline.zadd(`${NS}:index`, n, `filler-${n}`);
    await pipeline.exec();
    expect(await market.publishBase(listing(1, owner(1)), null)).toBe('full');
    expect(await direct.exists(keys(id(1), owner(1)).record)).toBe(0);
  });
});

describe('concurrency', () => {
  it('40 simultaneous publishes by one member admit exactly the cap, no more', async () => {
    const results = await Promise.all(
      Array.from({ length: 40 }, (_, n) => market.publishBase(listing(n + 1, owner(1), 200), null)),
    );
    expect(results.filter((r) => r === 'ok')).toHaveLength(market.MAX_LISTINGS_PER_USER);
    expect(results.filter((r) => r === 'user-limit')).toHaveLength(40 - market.MAX_LISTINGS_PER_USER);
    const k = keys(id(1), owner(1));
    expect(await num(k.count)).toBe(market.MAX_LISTINGS_PER_USER);
    expect(await direct.zcard(k.index)).toBe(market.MAX_LISTINGS_PER_USER);
    // The byte counters equal the sum of the recorded sizes: nothing leaked, nothing double counted.
    const sizes = await Promise.all(Array.from({ length: 40 }, (_, n) => direct.get(keys(id(n + 1), owner(1)).size)));
    const sum = sizes.reduce((total, value) => total + Number(value ?? 0), 0);
    expect(await num(k.bytes)).toBe(sum);
    expect(await num(k.total)).toBe(sum);
  });

  it('simultaneous publishes by the byte quota edge never exceed it', async () => {
    const results = await Promise.all(
      Array.from({ length: 24 }, (_, n) => market.publishBase(listing(n + 1, owner(1), 1_500_000), null)),
    );
    const accepted = results.filter((r) => r === 'ok').length;
    expect(accepted).toBe(Math.floor(market.MAX_BYTES_PER_USER / (1_500_000 + 400)));
    expect(await num(keys(id(1), owner(1)).bytes)).toBeLessThanOrEqual(market.MAX_BYTES_PER_USER);
  }, 60_000);

  it('each listing deleted twice at once is released exactly once; counters never go negative', async () => {
    for (let n = 1; n <= 10; n += 1) await market.publishBase(listing(n, owner(1), 1000), null);
    const attempts = await Promise.all(
      Array.from({ length: 10 }, (_, n) => [
        market.deleteBase(id(n + 1), [owner(1), owner(99)]),
        market.deleteBase(id(n + 1), [owner(1), owner(99)]),
      ]).flat(),
    );
    expect(attempts.filter(Boolean)).toHaveLength(10);
    expect(await dump()).toEqual({});
  });

  it('interleaved publishes and deletes keep counters equal to what is stored', async () => {
    for (let n = 1; n <= 10; n += 1) await market.publishBase(listing(n, owner(1), 500), null);
    await Promise.all([
      ...Array.from({ length: 10 }, (_, n) => market.deleteBase(id(n + 1), [owner(1), owner(99)])),
      ...Array.from({ length: 15 }, (_, n) => market.publishBase(listing(100 + n, owner(1), 500), null)),
    ]);
    const k = keys(id(100), owner(1));
    const stored = (await direct.keys(`${NS}:owner:*`)).length;
    expect(await num(k.count)).toBe(stored);
    expect(await direct.zcard(k.index)).toBe(stored);
    let sum = 0;
    for (const key of await direct.keys(`${NS}:size:*`)) sum += Number(await direct.get(key));
    expect(await num(k.bytes)).toBe(sum);
    expect(await num(k.total)).toBe(sum);
  });
});

describe('legacy owners and expired or malformed data', () => {
  it('a listing owned by a legacy key is deletable with the legacy key, and takes no bytes it never had', async () => {
    const legacy = owner(7);
    await direct.set(`${NS}:record:${id(1)}`, JSON.stringify(listing(1, legacy)));
    await direct.set(`${NS}:state:${id(1)}`, JSON.stringify(listing(1, legacy).summary));
    await direct.set(`${NS}:owner:${id(1)}`, legacy);
    await direct.zadd(`${NS}:index`, 1, JSON.stringify(listing(1, legacy).summary));
    await direct.set(`${NS}:user:${legacy}`, '1');
    await direct.set(`${NS}:bytes-total`, '5000');
    await direct.set(`${NS}:bytes:${owner(8)}`, '5000');
    expect(await market.deleteBase(id(1), [owner(8), legacy])).toBe(true);
    expect(await direct.exists(`${NS}:user:${legacy}`)).toBe(0);
    // Unrelated byte counters are untouched because this listing was never counted.
    expect(await num(`${NS}:bytes-total`)).toBe(5000);
    expect(await num(`${NS}:bytes:${owner(8)}`)).toBe(5000);
    expect(await direct.zcard(`${NS}:index`)).toBe(0);
  });

  it('an expired size record releases no bytes and cannot drive a counter negative', async () => {
    await market.publishBase(listing(1, owner(1), 2000), null);
    await market.publishBase(listing(2, owner(1), 2000), null);
    await direct.pexpire(keys(id(1), owner(1)).size, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(await market.deleteBase(id(1), [owner(1), owner(99)])).toBe(true);
    const k = keys(id(2), owner(1));
    expect(await num(k.bytes)).toBeGreaterThanOrEqual(0);
    expect(await num(k.count)).toBe(1);
    expect(await market.deleteBase(id(2), [owner(1), owner(99)])).toBe(true);
    for (const key of await direct.keys(`${NS}:*`)) {
      const value = await direct.get(key).catch(() => null);
      if (/bytes|user/.test(key)) expect(Number(value)).toBeGreaterThanOrEqual(0);
    }
  });

  it('an expired owner record means the listing is no longer deletable and nothing else moves', async () => {
    await market.publishBase(listing(1, owner(1), 100), null);
    await direct.del(keys(id(1), owner(1)).owner);
    const before = await dump();
    expect(await market.deleteBase(id(1), [owner(1), owner(99)])).toBe(false);
    expect(await dump()).toEqual(before);
  });

  it('a malformed counter fails closed: the publish is refused and nothing is written', async () => {
    const k = keys(id(1), owner(1));
    for (const bad of [k.count, k.bytes, k.total]) {
      await direct.flushdb();
      await direct.set(bad, 'not-a-number');
      const before = await dump();
      await expect(market.publishBase(listing(1, owner(1), 100), null)).rejects.toThrow();
      expect(await dump()).toEqual(before);
    }
  });

  it('a malformed size record never leaves a half-deleted listing: the delete completes and refunds nothing', async () => {
    await market.publishBase(listing(1, owner(1), 100), null);
    await market.publishBase(listing(2, owner(1), 100), null);
    const k = keys(id(1), owner(1));
    const heldBefore = await num(k.bytes);
    await direct.set(k.size, 'garbage');
    expect(await market.deleteBase(id(1), [owner(1), owner(99)])).toBe(true);
    expect(await direct.exists(k.record)).toBe(0);
    expect(await direct.exists(k.state)).toBe(0);
    expect(await direct.exists(k.owner)).toBe(0);
    expect(await direct.exists(k.size)).toBe(0);
    expect(await direct.zcard(k.index)).toBe(1);
    expect(await num(k.count)).toBe(1);
    // Nothing was refunded for the unreadable size, and nothing went negative.
    expect(await num(k.bytes)).toBe(heldBefore);
    expect(await num(k.total)).toBe(heldBefore);
  });

  it('malformed byte counters on delete do not abort halfway either', async () => {
    await market.publishBase(listing(1, owner(1), 100), null);
    const k = keys(id(1), owner(1));
    await direct.set(k.bytes, 'oops');
    await direct.set(k.total, 'oops');
    expect(await market.deleteBase(id(1), [owner(1), owner(99)])).toBe(true);
    expect(await direct.exists(k.record)).toBe(0);
    expect(await direct.zcard(k.index)).toBe(0);
  });
});

describe('failure modes', () => {
  it('a Redis that is not reachable rejects promptly instead of hanging or half-writing', async () => {
    const { createDashboardRedis } = await import('../../src/lib/redis/client');
    // Ask the OS for a free port and close it again, so the address is guaranteed to refuse connections.
    const { createServer } = await import('node:net');
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const deadPort = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const dead = createDashboardRedis(`redis://127.0.0.1:${deadPort}/15`);
    const started = Date.now();
    await expect(dead.eval('return 1', [`${NS}:probe`], [])).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(5000);
    dead.close();
    expect(await dump()).toEqual({});
  });

  it('all keys of both scripts share one hash tag, so they are valid on a Redis Cluster', async () => {
    const { assertSingleSlot, keySlot } = await import('../../src/lib/redis/connection');
    const k = keys(id(1), owner(1));
    const publishKeys = [k.index, k.record, k.state, k.owner, k.image, k.count, k.bytes, k.total, k.size];
    const deleteKeys = [
      ...publishKeys.slice(0, 6),
      `${NS}:user:${owner(2)}`,
      k.bytes,
      `${NS}:bytes:${owner(2)}`,
      k.total,
      k.size,
    ];
    expect(() => assertSingleSlot(publishKeys)).not.toThrow();
    expect(() => assertSingleSlot(deleteKeys)).not.toThrow();
    expect(new Set(publishKeys.map(keySlot)).size).toBe(1);
  });
});
