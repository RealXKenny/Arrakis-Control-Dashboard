import { once } from 'node:events';
import { afterEach, expect, it } from 'vitest';
import { createServer } from 'node:net';
import { createDashboardRedis } from '../../src/lib/redis';
import { createRedisFixture } from '../../scripts/fixtures/redis-resp.mjs';

const cleanups: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

it('rejects unavailable storage and connects on a later request after recovery', async () => {
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const { port } = reservation.address() as { port: number };
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const client = createDashboardRedis(`redis://127.0.0.1:${port}/0`);
  cleanups.push(() => client.close());
  await expect(client.get('session')).rejects.toThrow();
  const fixture = createRedisFixture(() => '{"user":{"id":"recovered"}}');
  fixture.server.listen(port, '127.0.0.1');
  await once(fixture.server, 'listening');
  cleanups.push(() => fixture.close());
  expect(await client.get('session')).toEqual({ user: { id: 'recovered' } });
});

it('preserves JSON, raw strings, leases, sorted sets and Lua arguments over TCP', async () => {
  const commands: string[][] = [];
  const values = new Map<string, string>();
  const fixture = createRedisFixture((args: string[]) => {
    commands.push(args);
    const [op, key, value] = args;
    if (op === 'GET') return values.get(key) ?? null;
    if (op === 'SET') {
      if (args.includes('NX') && values.has(key)) return null;
      values.set(key, value);
      return 'OK';
    }
    if (op === 'DEL') return Number(values.delete(key));
    if (op === 'ZRANGEBYSCORE') return ['{"at":123,"online":5}'];
    if (op === 'EVAL') return [1, 60000];
    return 1;
  });
  fixture.server.listen(0, '127.0.0.1');
  await once(fixture.server, 'listening');
  cleanups.push(() => fixture.close());
  const address = fixture.server.address() as { port: number };
  const client = createDashboardRedis(`redis://127.0.0.1:${address.port}/0`);
  cleanups.push(() => client.close());
  await Promise.all([
    client.set('session', { user: { id: 'é' } }, { ex: 43200 }),
    client.set('logo', 'data:image/png;base64,abc'),
  ]);
  expect(await client.get('session')).toEqual({ user: { id: 'é' } });
  expect(await client.get('logo')).toBe('data:image/png;base64,abc');
  expect(await client.get('missing')).toBeNull();
  expect(await client.set('lease', '1', { ex: 120, nx: true })).toBe('OK');
  expect(await client.set('lease', '1', { ex: 120, nx: true })).toBeNull();
  await client.zadd('history', { score: 123, member: { at: 123, online: 5 } });
  expect(await client.zrange('history', 0, 999, { byScore: true })).toEqual([{ at: 123, online: 5 }]);
  await client.zremrangebyscore('history', 0, 100);
  await client.expire('history', 172800);
  expect(await client.eval('return {1, 60000}', ['rate'], [60000])).toEqual([1, 60000]);
  expect(await client.del('session')).toBe(1);
  expect(await client.get('session')).toBeNull();
  expect(commands).toContainEqual(['SET', 'session', '{"user":{"id":"é"}}', 'EX', '43200']);
  expect(commands).toContainEqual(['ZADD', 'history', '123', '{"at":123,"online":5}']);
  expect(commands).toContainEqual(['EVAL', 'return {1, 60000}', '1', 'rate', '60000']);
  expect(commands).toContainEqual(['ZREMRANGEBYSCORE', 'history', '0', '100']);
  expect(commands).toContainEqual(['EXPIRE', 'history', '172800']);
});
