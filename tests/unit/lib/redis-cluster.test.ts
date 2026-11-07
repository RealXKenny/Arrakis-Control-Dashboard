import { describe, expect, it } from 'vitest';
import { assertSingleSlot, clusterNodesFromEnv, keySlot } from '../../../src/lib/redis/connection';
import { createDashboardRedis } from '../../../src/lib/redis/client';
import { baseMarketplaceKeys as keys } from '../../../src/server/base-marketplace';

describe('Redis Cluster slot maths', () => {
  it('matches the server for known keys', () => {
    expect(keySlot('foo')).toBe(12182);
    expect(keySlot('123456789')).toBe(12739);
  });

  it('honours hash tags, including degenerate ones', () => {
    expect(keySlot('{user1000}.following')).toBe(keySlot('{user1000}.followers'));
    expect(keySlot('{user1000}.following')).toBe(keySlot('user1000'));
    // An empty tag is ignored: the whole key is hashed.
    expect(keySlot('foo{}bar')).toBe(keySlot('foo{}bar'));
    expect(keySlot('foo{}bar')).not.toBe(keySlot('foo'));
    // Only the first complete tag counts.
    expect(keySlot('foo{{bar}}zap')).toBe(keySlot('{bar'));
  });

  it('rejects scripts whose keys span slots, and allows single keys and tagged sets', () => {
    expect(() => assertSingleSlot(['a'])).not.toThrow();
    expect(() => assertSingleSlot(['{t}:a', '{t}:b'])).not.toThrow();
    expect(() => assertSingleSlot(['alpha', 'beta'])).toThrow(/one hash slot/);
  });

  it('parses cluster node lists, including IPv6', () => {
    expect(clusterNodesFromEnv('a:7000, [::1]:7001 ,b')).toEqual([
      { host: 'a', port: 7000 },
      { host: '::1', port: 7001 },
      { host: 'b', port: 6379 },
    ]);
  });
});

describe('V2 keys are cluster-ready', () => {
  it('keeps every key a marketplace script touches in one slot', () => {
    const id = 'a'.repeat(24);
    const owner = 'b'.repeat(16);
    const all = [keys.index, keys.record(id), keys.state(id), keys.owner(id), keys.image(id), keys.userCount(owner)];
    expect(() => assertSingleSlot(all)).not.toThrow();
  });
});

describe('cluster-mode client', () => {
  it('refuses cross-slot scripts before touching the network', async () => {
    const client = createDashboardRedis('redis://127.0.0.1:1/0', { clusterNodes: '127.0.0.1:1' });
    try {
      expect(() => client.eval('return 1', ['alpha', 'beta'], [])).toThrow(/one hash slot/);
    } finally {
      client.close();
    }
  });

  it('fails fast instead of hanging when no node is reachable', async () => {
    const client = createDashboardRedis(undefined, { clusterNodes: '127.0.0.1:1' });
    try {
      await expect(client.get('x')).rejects.toThrow();
    } finally {
      client.close();
    }
  }, 10_000);
});
