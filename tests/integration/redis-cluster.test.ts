import { Cluster } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { keySlot } from '../../src/lib/redis/connection';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

/**
 * Behaviour that only exists on a real Redis Cluster: slot placement of every key family, redirection while the
 * topology changes, and a manual failover under live traffic. Skipped on a standalone Redis.
 *
 *   TEST_REDIS_CLUSTER_NODES=127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003 npm run test:integration
 *
 * The failover test promotes a replica with `CLUSTER FAILOVER` (a graceful, supported operation) on the throwaway
 * cluster named above. Never point this at a shared cluster.
 */
const target = integrationTarget();
const clustered = target.mode === 'cluster';
configureApplication(target);
process.env.AUTH_SECRET = 'integration-secret-integration-secret-0001';
process.env.OWNER_KEY_SECRET = 'integration-owner-secret-integration-0002';
process.env.AUDIT_LOG_REDIS = 'true';
process.env.AUDIT_LOG_STDOUT = 'false';
vi.mock('../../src/lib/assert-server', () => ({}));

const NS = 'arrakis:{bm}:v2';
const id = (n: number) => n.toString(16).padStart(24, '0');
const owner = (n: number) => n.toString(16).padStart(16, '0');

let direct: Cluster;
let market: typeof import('../../src/features/bases/server/marketplace');
let sessions: typeof import('../../src/features/auth/server/session-store');
let audit: typeof import('../../src/lib/security/audit');
let limiter: typeof import('../../src/lib/security/rate-limit');
type PublishRecord = Parameters<(typeof market)['publishBase']>[0];

function listing(n: number, ownerKey: string): PublishRecord {
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
      name: 'x'.repeat(200),
      instances: [{ building_type: 'BP_Wall', x: 0, y: 0, z: 0 }],
      placeables: [],
      pentashields: [],
    },
  } as unknown as PublishRecord;
}

/** The master that currently owns a key's slot, asked of the cluster itself. */
async function ownerOf(key: string) {
  const slot = keySlot(key);
  for (const master of direct.nodes('master')) {
    const slots = (await master.cluster('SLOTS')) as unknown as Array<[number, number, [string, number]]>;
    const range = slots.find(([from, to]) => slot >= from && slot <= to);
    if (range) return `${range[2][0]}:${range[2][1]}`;
  }
  throw new Error('slot not covered');
}
const masterPorts = () => direct.nodes('master').map((node) => node.options.port);

/** Every stored listing has all its parts, is indexed once, and the counters equal what is actually stored. */
async function invariants() {
  const ownerKeys = (await direct.keys(`${NS}:owner:*`)) as string[];
  const per = new Map<string, { count: number; bytes: number }>();
  let total = 0;
  for (const key of ownerKeys) {
    const listingId = key.slice(`${NS}:owner:`.length);
    const ownerKey = (await direct.get(key))!;
    const state = await direct.get(`${NS}:state:${listingId}`);
    expect(await direct.exists(`${NS}:record:${listingId}`), `record for ${listingId}`).toBe(1);
    expect(state, `state for ${listingId}`).not.toBeNull();
    expect(await direct.zscore(`${NS}:index`, state!), `index entry for ${listingId}`).not.toBeNull();
    const size = Number((await direct.get(`${NS}:size:${listingId}`)) ?? 0);
    const entry = per.get(ownerKey) ?? { count: 0, bytes: 0 };
    entry.count += 1;
    entry.bytes += size;
    per.set(ownerKey, entry);
    total += size;
  }
  expect(await direct.zcard(`${NS}:index`)).toBe(ownerKeys.length);
  for (const [ownerKey, entry] of per) {
    expect(Number((await direct.get(`${NS}:user:${ownerKey}`)) ?? 0), `count ${ownerKey}`).toBe(entry.count);
    expect(Number((await direct.get(`${NS}:bytes:${ownerKey}`)) ?? 0), `bytes ${ownerKey}`).toBe(entry.bytes);
  }
  expect(Number((await direct.get(`${NS}:bytes-total`)) ?? 0)).toBe(total);
  return { listings: ownerKeys.length, total };
}

beforeAll(async () => {
  if (!clustered) return;
  direct = connectDirect(target) as unknown as Cluster;
  market = await import('../../src/features/bases/server/marketplace');
  sessions = await import('../../src/features/auth/server/session-store');
  audit = await import('../../src/lib/security/audit');
  limiter = await import('../../src/lib/security/rate-limit');
});
afterAll(async () => {
  if (!clustered) return;
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  if (clustered) await direct.flushdb();
});

describe.skipIf(!clustered)('Redis Cluster', () => {
  it('is a healthy multi-master cluster with every slot covered', async () => {
    const info = (await direct.nodes('master')[0].cluster('INFO')) as string;
    expect(info).toMatch(/cluster_state:ok/);
    expect(info).toMatch(/cluster_slots_assigned:16384/);
    expect(direct.nodes('master').length).toBeGreaterThanOrEqual(3);
  });

  it('keeps each script family on exactly one node, the one that owns its slot', async () => {
    await market.publishBase(listing(1, owner(1)), null);
    await audit.recordAudit({ event: 'cluster.check', outcome: 'success' });
    await sessions.saveSession('cluster-session', {
      user: { id: '1' },
      guildId: 'g',
      roleIds: [],
      expiresAt: Date.now() + 60_000,
    });
    await limiter.checkRateLimit('cluster:check', { limit: 5, windowMs: 60_000 });
    const families: Array<[string, string]> = [
      ['marketplace', `${NS}:index`],
      ['audit', 'arrakis:{audit}:v1:events'],
    ];
    for (const [name, key] of families) {
      const expected = await ownerOf(key);
      const holders: string[] = [];
      for (const master of direct.nodes('master'))
        if ((await master.keys(key)).length) holders.push(`${master.options.host}:${master.options.port}`);
      expect(holders, name).toEqual([expected]);
    }
    // Every marketplace key for one listing shares the slot, which is what lets a multi-key script run at all.
    const slots = new Set((await direct.keys('*')).filter((k) => k.startsWith(NS)).map(keySlot));
    expect(slots.size).toBe(1);
  });

  it('single-key traffic (sessions, rate limits) spreads across several nodes', async () => {
    for (let n = 0; n < 40; n += 1)
      await sessions.saveSession(`spread-${n}`, {
        user: { id: String(n) },
        guildId: 'g',
        roleIds: [],
        expiresAt: Date.now() + 60_000,
      });
    const used = new Set<number | undefined>();
    for (const master of direct.nodes('master'))
      if ((await master.keys('arrakis:session:*')).length) used.add(master.options.port);
    expect(used.size).toBeGreaterThan(1);
  });

  it('survives a manual failover of the marketplace shard under live traffic with consistent counters', async () => {
    const shard = await ownerOf(`${NS}:index`);
    let promoted: ReturnType<Cluster['nodes']>[number] | undefined;
    for (const candidate of direct.nodes('slave')) {
      const info = (await candidate.info('replication')) as string;
      const masterPort = /master_port:(\d+)/.exec(info)?.[1];
      if (masterPort && shard.endsWith(`:${masterPort}`)) promoted = candidate;
    }
    expect(promoted, 'a replica for the marketplace shard').toBeDefined();

    // Warm up, then keep publishing and deleting while the replica takes over.
    for (let n = 1; n <= 10; n += 1) expect(await market.publishBase(listing(n, owner(n % 3)), null)).toBe('ok');
    let running = true;
    const outcomes: string[] = [];
    const traffic = (async () => {
      let n = 100;
      while (running) {
        n += 1;
        try {
          outcomes.push(await market.publishBase(listing(n, owner(n % 3)), null));
          if (n % 4 === 0) await market.deleteBase(id(n), [owner(n % 3), owner(99)]);
        } catch {
          outcomes.push('error');
        }
        await new Promise((resolve) => setTimeout(resolve, 15));
      }
    })();

    // A graceful failover occasionally times out when the old master is busy; FORCE is the supported fallback.
    let settled = false;
    for (const mode of [[], ['FORCE']]) {
      await promoted!.call('CLUSTER', 'FAILOVER', ...mode);
      const deadline = Date.now() + 9_000;
      while (Date.now() < deadline && !settled) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        settled = (await ownerOf(`${NS}:index`)) !== shard;
      }
      if (settled) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    running = false;
    await traffic;

    expect(
      settled,
      `the replica became the owner of the marketplace slot (was ${shard}, now ${await ownerOf(`${NS}:index`)})`,
    ).toBe(true);
    expect(outcomes.filter((outcome) => outcome === 'ok').length).toBeGreaterThan(10);
    // Whatever was lost to the transition, the stored state must still add up exactly.
    const afterwards = await invariants();
    expect(afterwards.listings).toBeGreaterThan(0);
    // And the application keeps working normally on the new topology.
    expect(await market.publishBase(listing(9_999, owner(7)), null)).toBe('ok');
    expect(await market.deleteBase(id(9_999), [owner(7), owner(99)])).toBe(true);
    await invariants();
    expect(masterPorts().length).toBeGreaterThanOrEqual(3);
  }, 90_000);
});
