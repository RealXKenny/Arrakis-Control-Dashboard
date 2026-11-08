import { describe, expect, it, vi } from 'vitest';
import {
  applyRekey,
  keys,
  ownerKeyPair,
  planRekey,
  rollbackRekey,
  swapOwnerKey,
} from '../../../scripts/maintenance/rekey-marketplace-rules.mjs';

vi.mock('../../../src/lib/assert-server', () => ({}));

const env = { AUTH_SECRET: 'test-secret-test-secret-test-secret-1234' } as Record<string, string>;

/** Minimal in-memory Redis covering exactly the commands the migration uses. */
function fakeRedis() {
  const strings = new Map<string, string>();
  const zsets = new Map<string, Map<string, number>>();
  const zset = (key: string) => zsets.get(key) ?? zsets.set(key, new Map()).get(key)!;
  return {
    strings,
    zsets,
    async get(key: string) {
      return strings.get(key) ?? null;
    },
    async set(key: string, value: string) {
      strings.set(key, value);
    },
    async del(key: string) {
      strings.delete(key);
    },
    async incr(key: string) {
      strings.set(key, String(Number(strings.get(key) ?? 0) + 1));
    },
    async decr(key: string) {
      strings.set(key, String(Number(strings.get(key) ?? 0) - 1));
    },
    async zscore(key: string, member: string) {
      return zset(key).get(member)?.toString() ?? null;
    },
    async zadd(key: string, score: string | number, member: string) {
      zset(key).set(member, Number(score));
    },
    async zrem(key: string, member: string) {
      zset(key).delete(member);
    },
    async scan(_cursor: string, _match: string, pattern: string) {
      const prefix = pattern.replace(/\*$/, '');
      return ['0', [...strings.keys()].filter((key) => key.startsWith(prefix))];
    },
  };
}

function seed(redis: ReturnType<typeof fakeRedis>) {
  const alice = '111111111111111111';
  const bob = '222222222222222222';
  const orphan = '999999999999999999';
  for (const id of [alice, bob]) redis.strings.set(`arrakis:auth:user:${id}`, JSON.stringify({ discordId: id }));
  const layout = { instances: [], placeables: [{ building_type: 'Wall', x: 1, y: 2, z: 3 }] };
  const add = (listing: string, discordId: string, count?: string) => {
    const legacy = ownerKeyPair(discordId, env).legacy;
    const summary = JSON.stringify({ id: listing, title: `Base ${listing}`, ownerKey: legacy });
    redis.strings.set(keys.record(listing), JSON.stringify({ summary: JSON.parse(summary), layout }));
    redis.strings.set(keys.state(listing), summary);
    redis.strings.set(keys.owner(listing), legacy);
    redis.zsets.set(keys.index, (redis.zsets.get(keys.index) ?? new Map()).set(summary, -Date.now()));
    if (count) redis.strings.set(keys.userCount(legacy), count);
    return { legacy, summary };
  };
  const a1 = add('a'.repeat(24), alice, '2');
  add('b'.repeat(24), alice);
  const b1 = add('c'.repeat(24), bob, '1');
  add('d'.repeat(24), orphan, '1');
  return { alice, bob, a1, b1 };
}

describe('marketplace owner-key migration', () => {
  it('derives keys identically to the application code and never equals the legacy hash', async () => {
    vi.stubEnv('AUTH_SECRET', env.AUTH_SECRET);
    vi.stubEnv('NODE_ENV', 'test');
    const { ownerKeyForId, legacyOwnerKeyForId } = await import('../../../src/features/bases/server/owner-key');
    const pair = ownerKeyPair('111111111111111111', env);
    expect(ownerKeyForId('111111111111111111')).toBe(pair.current);
    expect(legacyOwnerKeyForId('111111111111111111')).toBe(pair.legacy);
    expect(pair.current).not.toBe(pair.legacy);
    expect(pair.current).toMatch(/^[a-f0-9]{16}$/);
    // A different secret yields different keys, so the legacy "hash the public Discord ID" attack no longer works.
    expect(
      ownerKeyPair('111111111111111111', { AUTH_SECRET: 'another-secret-another-secret-123456' }).current,
    ).not.toBe(pair.current);
    vi.unstubAllEnvs();
  });

  it('plans without writing, migrates listings and counters, and leaves unknown owners alone', async () => {
    const redis = fakeRedis();
    const { alice, bob } = seed(redis);
    const before = new Map(redis.strings);
    const plan = await planRekey(redis, env);
    expect(plan).toMatchObject({ listings: 4 });
    expect(plan.moves).toHaveLength(3);
    expect(plan.unmatched).toEqual(['d'.repeat(24)]);
    expect(redis.strings).toEqual(before);

    const result = await applyRekey(redis, plan);
    expect(result).toMatchObject({ moved: 3, skipped: 0 });
    const aliceKeys = ownerKeyPair(alice, env);
    const bobKeys = ownerKeyPair(bob, env);
    for (const listing of ['a'.repeat(24), 'b'.repeat(24)]) {
      expect(redis.strings.get(keys.owner(listing))).toBe(aliceKeys.current);
      expect(JSON.parse(redis.strings.get(keys.record(listing))!).summary.ownerKey).toBe(aliceKeys.current);
      expect(redis.strings.get(keys.state(listing))).toContain(aliceKeys.current);
      // The layout survives byte for byte, including empty arrays.
      expect(JSON.parse(redis.strings.get(keys.record(listing))!).layout.instances).toEqual([]);
    }
    // Counters move with the listings: Alice had a counter of 2 on the legacy key.
    expect(redis.strings.get(keys.userCount(aliceKeys.legacy))).toBeUndefined();
    expect(redis.strings.get(keys.userCount(aliceKeys.current))).toBe('2');
    expect(redis.strings.get(keys.userCount(bobKeys.current))).toBe('1');
    // The index holds exactly the migrated summaries, none of them legacy, and the orphan is untouched.
    const members = [...redis.zsets.get(keys.index)!.keys()];
    expect(members).toHaveLength(4);
    expect(members.filter((member) => member.includes(aliceKeys.legacy) || member.includes(bobKeys.legacy))).toEqual(
      [],
    );
    expect(redis.strings.get(keys.owner('d'.repeat(24)))).toBe(ownerKeyPair('999999999999999999', env).legacy);

    // Running it again changes nothing.
    const again = await planRekey(redis, env);
    expect(again.moves).toEqual([]);
  });

  it('rolls back exactly to the previous state from the backup', async () => {
    const redis = fakeRedis();
    seed(redis);
    const snapshot = JSON.stringify([...redis.strings].sort());
    const members = [...redis.zsets.get(keys.index)!.keys()].sort();
    const { backup } = await applyRekey(redis, await planRekey(redis, env));
    expect(JSON.stringify([...redis.strings].sort())).not.toBe(snapshot);

    expect(await rollbackRekey(redis, backup)).toEqual({ restored: 3 });
    expect(JSON.stringify([...redis.strings].sort())).toBe(snapshot);
    expect([...redis.zsets.get(keys.index)!.keys()].sort()).toEqual(members);
  });

  it('moves byte quotas with the listings and back again on rollback', async () => {
    const redis = fakeRedis();
    const { alice } = seed(redis);
    const pair = ownerKeyPair(alice, env);
    redis.strings.set(keys.size('a'.repeat(24)), '1000');
    redis.strings.set(keys.userBytes(pair.legacy), '1000');
    const { backup } = await applyRekey(redis, await planRekey(redis, env));
    expect(redis.strings.get(keys.userBytes(pair.legacy))).toBeUndefined();
    expect(redis.strings.get(keys.userBytes(pair.current))).toBe('1000');
    await rollbackRekey(redis, backup);
    expect(redis.strings.get(keys.userBytes(pair.legacy))).toBe('1000');
    expect(redis.strings.get(keys.userBytes(pair.current))).toBeUndefined();
  });

  it('only rewrites the owner key field', () => {
    expect(swapOwnerKey('{"a":1,"ownerKey":"aaaa","b":[]}', 'aaaa', 'bbbb')).toBe('{"a":1,"ownerKey":"bbbb","b":[]}');
    expect(swapOwnerKey('{"a":1}', 'aaaa', 'bbbb')).toBe('{"a":1}');
  });
});
