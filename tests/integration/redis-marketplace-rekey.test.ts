import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Redis } from 'ioredis';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyRekey,
  backupRekey,
  ownerKeyPair,
  planRekey,
  rollbackRekey,
} from '../../scripts/maintenance/rekey-marketplace-rules.mjs';

/**
 * `npm run marketplace:rekey` against a REAL Redis: dry run, backup, migration, ownership, counters, rollback,
 * repetition, mixed key generations, interruption at every point and secret rotation.
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6390/15 npm run test:integration
 */
const target = integrationTarget();

const SECRET = 'integration-owner-secret-integration-0002';
const ROTATED = 'rotated-owner-secret-rotated-owner-0003';
configureApplication(target);
process.env.AUTH_SECRET = 'integration-secret-integration-secret-0001';
process.env.OWNER_KEY_SECRET = SECRET;
vi.mock('../../src/lib/assert-server', () => ({}));

const run = promisify(execFile);
const script = path.resolve('scripts/maintenance/rekey-marketplace.mjs');
const NS = 'arrakis:{bm}:v2';
const ALICE = '111111111111111111';
const BOB = '222222222222222222';
const CAROL = '333333333333333333';
const ORPHAN = '999999999999999999';
const env = { OWNER_KEY_SECRET: SECRET, AUTH_SECRET: process.env.AUTH_SECRET } as Record<string, string>;

let direct: Redis;
let market: typeof import('../../src/features/bases/server/marketplace');
let work: string;
type PublishRecord = Parameters<(typeof market)['publishBase']>[0];

const id = (n: number) => n.toString(16).padStart(24, '0');
const pair = (discordId: string, overrides: Record<string, string> = {}) =>
  ownerKeyPair(discordId, { ...env, ...overrides });

function listing(n: number, ownerKey: string, padding: number): PublishRecord {
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

/** Alice 3 legacy + 1 HMAC, Bob 2 legacy, Carol 1 HMAC, plus one listing of an owner with no account. */
async function seed() {
  for (const user of [ALICE, BOB, CAROL])
    await direct.set(`arrakis:auth:user:${user}`, JSON.stringify({ discordId: user, createdAt: 1 }));
  const plan: Array<[number, string, number]> = [
    [1, pair(ALICE).legacy, 1000],
    [2, pair(ALICE).legacy, 2000],
    [3, pair(ALICE).legacy, 3000],
    [4, pair(ALICE).current, 4000],
    [5, pair(BOB).legacy, 5000],
    [6, pair(BOB).legacy, 6000],
    [7, pair(CAROL).current, 7000],
    [8, pair(ORPHAN).legacy, 8000],
  ];
  for (const [n, ownerKey, padding] of plan)
    expect(await market.publishBase(listing(n, ownerKey, padding), null)).toBe('ok');
}

async function dump() {
  const out: Record<string, unknown> = {};
  for (const key of (await direct.keys('*')).sort()) {
    out[key] =
      (await direct.type(key)) === 'zset' ? await direct.zrange(key, 0, -1, 'WITHSCORES') : await direct.get(key);
  }
  return out;
}
// The CLI reads `.env` from its working directory. Run it from an empty temp directory so it can never pick up the
// developer's real Redis settings, and name the target explicitly (an empty value counts as absent).
const cli = (args: string[], extra: Record<string, string> = {}) =>
  run(process.execPath, [script, ...args], {
    cwd: work,
    env: {
      ...process.env,
      REDIS_URL: process.env.REDIS_URL ?? '',
      REDIS_CLUSTER_NODES: process.env.REDIS_CLUSTER_NODES ?? '',
      ...extra,
    },
    timeout: 30_000,
  }).then(
    (result) => ({ code: 0, out: result.stdout, err: result.stderr }),
    (error) => ({ code: error.code as number, out: String(error.stdout ?? ''), err: String(error.stderr ?? '') }),
  );

/** The truth the counters must equal: what is actually stored, per owner. */
async function truth() {
  const counts: Record<string, number> = {};
  const bytes: Record<string, number> = {};
  for (const key of await direct.keys(`${NS}:owner:*`)) {
    const owner = (await direct.get(key))!;
    counts[owner] = (counts[owner] ?? 0) + 1;
    const size = Number((await direct.get(`${NS}:size:${key.split(':').pop()}`)) ?? 0);
    if (size) bytes[owner] = (bytes[owner] ?? 0) + size;
  }
  return { counts, bytes };
}
async function expectCountersMatchTruth() {
  const { counts, bytes } = await truth();
  for (const key of await direct.keys(`${NS}:user:*`)) {
    const owner = key.split(':').pop()!;
    expect(Number(await direct.get(key)), `count ${owner}`).toBe(counts[owner] ?? 0);
  }
  for (const [owner, count] of Object.entries(counts))
    expect(Number(await direct.get(`${NS}:user:${owner}`))).toBe(count);
  for (const key of await direct.keys(`${NS}:bytes:*`)) {
    const owner = key.split(':').pop()!;
    expect(Number(await direct.get(key)), `bytes ${owner}`).toBe(bytes[owner] ?? 0);
  }
  for (const [owner, total] of Object.entries(bytes))
    expect(Number(await direct.get(`${NS}:bytes:${owner}`))).toBe(total);
}

/** A Redis wrapper that fails after `budget` write commands, simulating a crash part-way through. */
function crashing(budget: number) {
  let left = budget;
  return new Proxy(direct, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== 'function') return value;
      if (['set', 'del', 'zadd', 'zrem'].includes(String(prop)))
        return (...args: unknown[]) => {
          if (left-- <= 0) throw new Error('simulated crash');
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      return value.bind(target);
    },
  }) as Redis;
}

beforeAll(async () => {
  direct = connectDirect(target);
  market = await import('../../src/features/bases/server/marketplace');
  work = await mkdtemp(path.join(tmpdir(), 'rekey-'));
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
  await rm(work, { recursive: true, force: true });
});
beforeEach(async () => {
  await direct.flushdb();
  await seed();
});

describe('marketplace:rekey on a real Redis', () => {
  it('a dry run reports the plan and writes nothing', async () => {
    const before = await dump();
    const result = await cli([]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('DRY RUN: 8 listings, 5 to migrate');
    expect(result.out).toContain('(left unchanged): 1');
    expect(await dump()).toEqual(before);
  });

  it('refuses to apply without a backup file, and writes nothing', async () => {
    const before = await dump();
    const result = await cli(['--apply']);
    expect(result.code).toBe(1);
    expect(result.err).toMatch(/--backup/);
    expect(await dump()).toEqual(before);
  });

  it('migrates owners, index and counters, preserves ownership and scores, and writes a backup first', async () => {
    const scoresBefore = new Map<string, string>();
    const indexBefore = await direct.zrange(`${NS}:index`, 0, -1, 'WITHSCORES');
    for (let i = 0; i < indexBefore.length; i += 2) scoresBefore.set(JSON.parse(indexBefore[i]).id, indexBefore[i + 1]);
    const backupFile = path.join(work, 'backup.json');
    const result = await cli(['--apply', '--backup', backupFile]);
    expect(result.code).toBe(0);
    expect(result.out).toContain('moved 5, skipped 0');
    expect(JSON.parse(await readFile(backupFile, 'utf8'))).toHaveLength(5);

    const alice = pair(ALICE);
    const bob = pair(BOB);
    for (const n of [1, 2, 3, 4]) expect(await direct.get(`${NS}:owner:${id(n)}`)).toBe(alice.current);
    for (const n of [5, 6]) expect(await direct.get(`${NS}:owner:${id(n)}`)).toBe(bob.current);
    expect(await direct.get(`${NS}:owner:${id(7)}`)).toBe(pair(CAROL).current);
    // The member with no account is left exactly as it was.
    expect(await direct.get(`${NS}:owner:${id(8)}`)).toBe(pair(ORPHAN).legacy);

    // Index: same size, same scores, every member's summary carries the new owner key, no legacy member left.
    const index = await direct.zrange(`${NS}:index`, 0, -1, 'WITHSCORES');
    expect(index.length / 2).toBe(8);
    const dead = new Set([alice.legacy, bob.legacy]);
    for (let i = 0; i < index.length; i += 2) {
      const summary = JSON.parse(index[i]);
      expect(scoresBefore.get(summary.id)).toBe(index[i + 1]);
      expect(dead.has(summary.ownerKey)).toBe(false);
      expect(JSON.parse((await direct.get(`${NS}:record:${summary.id}`))!).summary.ownerKey).toBe(summary.ownerKey);
      expect(await direct.get(`${NS}:state:${summary.id}`)).toBe(index[i]);
    }

    // Counters: legacy and HMAC listings of the same member merge into one count, bytes follow, nothing is lost.
    expect(await direct.get(`${NS}:user:${alice.current}`)).toBe('4');
    expect(await direct.get(`${NS}:user:${bob.current}`)).toBe('2');
    expect(
      await direct.exists(`${NS}:user:${alice.legacy}`, `${NS}:user:${bob.legacy}`, `${NS}:bytes:${alice.legacy}`),
    ).toBe(0);
    await expectCountersMatchTruth();
    const total = Number(await direct.get(`${NS}:bytes-total`));
    const { bytes } = await truth();
    expect(total).toBe(Object.values(bytes).reduce((a, b) => a + b, 0));
  });

  it('ownership survives: only the right member can delete, with either key generation, and counters return to zero', async () => {
    await cli(['--apply', '--backup', path.join(work, 'b.json')]);
    const alice = pair(ALICE);
    const bob = pair(BOB);
    expect(await market.deleteBase(id(1), [bob.current, bob.legacy])).toBe(false);
    expect(await market.deleteBase(id(1), [alice.current, alice.legacy])).toBe(true);
    for (const n of [2, 3, 4]) expect(await market.deleteBase(id(n), [alice.current, alice.legacy])).toBe(true);
    for (const n of [5, 6]) expect(await market.deleteBase(id(n), [bob.current, bob.legacy])).toBe(true);
    expect(await market.deleteBase(id(7), [pair(CAROL).current, pair(CAROL).legacy])).toBe(true);
    expect(await market.deleteBase(id(8), [pair(ORPHAN).current, pair(ORPHAN).legacy])).toBe(true);
    const left = (await direct.keys('*')).filter((key) => !key.startsWith('arrakis:auth:'));
    expect(left).toEqual([]);
  });

  it('is safe to repeat: the second run has nothing to do and changes nothing', async () => {
    await cli(['--apply', '--backup', path.join(work, 'b1.json')]);
    const after = await dump();
    const again = await cli(['--apply', '--backup', path.join(work, 'b2.json')]);
    expect(again.out).toContain('0 to migrate');
    expect(await dump()).toEqual(after);
  });

  it('rolls back to exactly the previous state, including the index and every counter', async () => {
    const before = await dump();
    const backupFile = path.join(work, 'rollback.json');
    await cli(['--apply', '--backup', backupFile]);
    expect(await dump()).not.toEqual(before);
    const result = await cli(['--rollback', backupFile]);
    expect(result.out).toContain('restored 5 of 5');
    expect(await dump()).toEqual(before);
  });

  it('survives being interrupted at any point: resuming reaches the same end state, and rolling back restores the start', async () => {
    const start = await dump();
    const planned = await planRekey(direct, env);
    await applyRekey(direct, planned);
    const golden = await dump();
    for (const budget of [1, 2, 3, 4, 5, 7, 9, 12, 16, 20, 26]) {
      // Resume path.
      await direct.flushdb();
      await seed();
      const plan = await planRekey(direct, env);
      const backup = await backupRekey(direct, plan);
      await expect(applyRekey(crashing(budget), plan)).rejects.toThrow('simulated crash');
      // Whatever state the crash left, the dashboard still owns every listing (both generations are accepted).
      for (const n of [1, 2, 3, 5, 6]) {
        const owner = await direct.get(`${NS}:owner:${id(n)}`);
        expect([pair(n <= 3 ? ALICE : BOB).legacy, pair(n <= 3 ? ALICE : BOB).current]).toContain(owner);
      }
      const resumed = await planRekey(direct, env);
      await applyRekey(direct, resumed);
      expect(await dump(), `resume after ${budget} writes`).toEqual(golden);
      await expectCountersMatchTruth();

      // Rollback path.
      await direct.flushdb();
      await seed();
      const startAgain = await dump();
      expect(startAgain).toEqual(start);
      const plan2 = await planRekey(direct, env);
      const backup2 = await backupRekey(direct, plan2);
      await expect(applyRekey(crashing(budget), plan2)).rejects.toThrow('simulated crash');
      await rollbackRekey(direct, backup2);
      expect(await dump(), `rollback after ${budget} writes`).toEqual(start);
      void backup;
    }
  }, 120_000);

  it('rotating the secret orphans migrated listings until they are re-keyed with the previous secret', async () => {
    await cli(['--apply', '--backup', path.join(work, 'b.json')]);
    const rotated = pair(ALICE, { OWNER_KEY_SECRET: ROTATED });
    expect(rotated.current).not.toBe(pair(ALICE).current);
    // With only the new secret, nobody can delete the migrated listing: ownership is lost, nothing else breaks.
    expect(await market.deleteBase(id(1), [rotated.current, rotated.legacy])).toBe(false);
    expect(await direct.exists(`${NS}:record:${id(1)}`)).toBe(1);

    // Re-keying with the old secret named as previous restores ownership under the new secret.
    const result = await cli(['--apply', '--backup', path.join(work, 'rotate.json')], {
      OWNER_KEY_SECRET: ROTATED,
      OWNER_KEY_PREVIOUS_SECRET: SECRET,
    });
    expect(result.code).toBe(0);
    expect(result.out).toContain('to migrate');
    expect(await direct.get(`${NS}:owner:${id(1)}`)).toBe(rotated.current);
    expect(await market.deleteBase(id(1), [rotated.current, rotated.legacy])).toBe(true);
    await expectCountersMatchTruth();
  });
});
