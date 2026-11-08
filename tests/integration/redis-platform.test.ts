import { createHash } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

/**
 * Sessions, account claims, rate limiting and the audit trail against a REAL Redis (standalone or Cluster).
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6391/15 npm run test:integration
 *   TEST_REDIS_CLUSTER_NODES=127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003 npm run test:integration
 */
const target = integrationTarget();
configureApplication(target);
process.env.AUTH_SECRET = 'integration-secret-integration-secret-0001';
process.env.AUDIT_LOG_REDIS = 'true';
process.env.AUDIT_LOG_STDOUT = 'false';
process.env.AUDIT_LOG_RETENTION_DAYS = '30';
process.env.AUDIT_LOG_MAX_ENTRIES = '100';
vi.mock('../../src/lib/assert-server', () => ({}));

const AUDIT_KEY = 'arrakis:{audit}:v1:events';
let direct: Redis;
let sessions: typeof import('../../src/features/auth/server/session-store');
let users: typeof import('../../src/features/auth/server/users');
let limiter: typeof import('../../src/lib/security/rate-limit');
let audit: typeof import('../../src/lib/security/audit');

const sessionKey = (sessionId: string) => `arrakis:session:${createHash('sha256').update(sessionId).digest('hex')}`;
const liveSession = (id = '1001', overrides: Record<string, unknown> = {}) => ({
  user: { id, username: `user-${id}` },
  guildId: 'guild',
  roleIds: ['role'],
  verifiedAt: Date.now(),
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 3_600_000,
  ...overrides,
});

beforeAll(async () => {
  direct = connectDirect(target);
  sessions = await import('../../src/features/auth/server/session-store');
  users = await import('../../src/features/auth/server/users');
  limiter = await import('../../src/lib/security/rate-limit');
  audit = await import('../../src/lib/security/audit');
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  await direct.flushdb();
});

describe('sessions', () => {
  it('persist with an expiry, are stored only under a hash of the id, and read back intact', async () => {
    const stored = liveSession('1001');
    expect(await sessions.saveSession('session_abc-123', stored)).toBe(true);
    expect(await direct.keys('*')).toEqual([sessionKey('session_abc-123')]);
    const ttl = await direct.ttl(sessionKey('session_abc-123'));
    expect(ttl).toBeGreaterThan(3_500);
    expect(ttl).toBeLessThanOrEqual(3_600);
    expect(await sessions.readSession('session_abc-123')).toEqual(stored);
  });

  it('are isolated from each other: one id never returns another member’s session', async () => {
    await sessions.saveSession('session-a', liveSession('1001'));
    await sessions.saveSession('session-b', liveSession('2002'));
    expect((await sessions.readSession('session-a'))?.user.id).toBe('1001');
    expect((await sessions.readSession('session-b'))?.user.id).toBe('2002');
    expect(await sessions.readSession('session-c')).toBeNull();
  });

  it('revocation is immediate and a background write cannot resurrect a revoked session', async () => {
    await sessions.saveSession('session-a', liveSession());
    await sessions.deleteSession('session-a');
    expect(await sessions.readSession('session-a')).toBeNull();
    expect(await sessions.saveSession('session-a', liveSession(), { onlyIfExists: true })).toBe(false);
    expect(await direct.exists(sessionKey('session-a'))).toBe(0);
    // A normal (login) write still creates the session.
    expect(await sessions.saveSession('session-a', liveSession())).toBe(true);
  });

  it('a conditional update refreshes a live session without changing who it belongs to', async () => {
    await sessions.saveSession('session-a', liveSession('1001'));
    expect(
      await sessions.saveSession('session-a', liveSession('1001', { roleIds: ['new'] }), { onlyIfExists: true }),
    ).toBe(true);
    expect((await sessions.readSession('session-a'))?.roleIds).toEqual(['new']);
  });

  it('expire in Redis on their own', async () => {
    await sessions.saveSession('session-a', liveSession());
    await direct.pexpire(sessionKey('session-a'), 50);
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(await sessions.readSession('session-a')).toBeNull();
  });

  it('malformed or tampered stored sessions are rejected and removed', async () => {
    for (const [id, raw] of [
      ['bad-json', '{not json'],
      ['wrong-shape', JSON.stringify({ user: { id: 7 }, guildId: 'g' })],
      ['far-future', JSON.stringify(liveSession('1', { expiresAt: Date.now() + 400 * 86_400_000 }))],
      ['already-expired', JSON.stringify(liveSession('1', { expiresAt: Date.now() - 1000 }))],
    ] as const) {
      await direct.set(sessionKey(id), raw);
      expect(await sessions.readSession(id), id).toBeNull();
    }
    for (const id of ['wrong-shape', 'already-expired']) expect(await direct.exists(sessionKey(id))).toBe(0);
  });

  it('rejects ids that are not well formed without touching Redis', async () => {
    expect(await sessions.readSession('../etc/passwd')).toBeNull();
    expect(await sessions.readSession('x'.repeat(200))).toBeNull();
    await expect(sessions.saveSession('bad id', liveSession())).rejects.toThrow();
    expect(await direct.keys('*')).toEqual([]);
  });

  it('survives a brand-new client (a restarted server) because state lives in Redis', async () => {
    await sessions.saveSession('session-a', liveSession());
    (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
    delete (globalThis as { arrakisRedisClient?: unknown }).arrakisRedisClient;
    expect((await sessions.readSession('session-a'))?.user.id).toBe('1001');
  });
});

describe('account claims', () => {
  it('lets exactly one Discord account claim an email, even when claimed at once', async () => {
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, n) => users.claimEmail(`discord-${n}`, 'shared@example.com')),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const winner = results.findIndex(Boolean);
    expect(await users.claimEmail(`discord-${winner}`, 'shared@example.com')).toBe(true);
    expect(await users.claimEmail('someone-else', 'shared@example.com')).toBe(false);
  });
});

describe('rate limiting', () => {
  const rule = { limit: 5, windowMs: 60_000 };

  it('allows exactly the limit under heavy concurrency and then refuses, with a retry hint', async () => {
    const results = await Promise.all(Array.from({ length: 60 }, () => limiter.checkRateLimit('login:1.2.3.4', rule)));
    expect(results.filter((result) => result.allowed)).toHaveLength(5);
    expect(results.filter((result) => !result.allowed)).toHaveLength(55);
    const refused = results.find((result) => !result.allowed)!;
    expect(refused.remaining).toBe(0);
    expect(refused.retryAfter).toBeGreaterThan(0);
    expect(refused.retryAfter).toBeLessThanOrEqual(60);
    expect(refused.storageUnavailable).toBeUndefined();
  });

  it('keeps counters per key and never stores the raw key', async () => {
    for (let n = 0; n < 6; n += 1) await limiter.checkRateLimit('login:attacker', rule);
    expect((await limiter.checkRateLimit('login:attacker', rule)).allowed).toBe(false);
    expect((await limiter.checkRateLimit('login:someone-else', rule)).allowed).toBe(true);
    for (const key of await direct.keys('*')) expect(key).not.toContain('attacker');
  });

  it('every counter has an expiry, even if a previous process lost it', async () => {
    await limiter.checkRateLimit('login:ttl', rule);
    const [key] = await direct.keys('arrakis:rate:*');
    expect(await direct.pttl(key)).toBeGreaterThan(0);
    await direct.persist(key);
    expect(await direct.pttl(key)).toBe(-1);
    await limiter.checkRateLimit('login:ttl', rule);
    expect(await direct.pttl(key)).toBeGreaterThan(0);
  });

  it('opens a fresh window after the old one expires', async () => {
    const tight = { limit: 1, windowMs: 150 };
    expect((await limiter.checkRateLimit('login:window', tight)).allowed).toBe(true);
    expect((await limiter.checkRateLimit('login:window', tight)).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect((await limiter.checkRateLimit('login:window', tight)).allowed).toBe(true);
  });

  it('different windows for the same key are separate counters', async () => {
    await limiter.checkRateLimit('shared', { limit: 1, windowMs: 1_000 });
    await limiter.checkRateLimit('shared', { limit: 1, windowMs: 2_000 });
    expect((await direct.keys('arrakis:rate:*')).length).toBe(2);
  });
});

describe('audit trail', () => {
  const stored = async () => (await direct.zrange(AUDIT_KEY, 0, -1)).map((line) => JSON.parse(line));

  it('stores events newest-first with an expiry, and never stores secrets', async () => {
    await audit.recordAudit({
      event: 'auth.login',
      outcome: 'success',
      actor: '1001',
      ip: '203.0.113.9',
      data: { route: '/api/x', password: 'hunter2', apiKey: 'sk-live', nested: { secret: 1 }, note: 'a\nb', ok: true },
    });
    await audit.recordAudit({ event: 'admin.action', outcome: 'denied', actor: '1001' });
    const events = await audit.readAudit(10);
    expect(events.map((event) => event.event)).toEqual(['admin.action', 'auth.login']);
    const raw = JSON.stringify(await stored());
    expect(raw).not.toMatch(/hunter2|sk-live|secret/);
    expect(events[1].data).toEqual({ route: '/api/x', note: 'a b', ok: true });
    const ttl = await direct.ttl(AUDIT_KEY);
    expect(ttl).toBeGreaterThan(29 * 86_400);
    expect(ttl).toBeLessThanOrEqual(30 * 86_400);
  });

  it('drops entries older than the retention window on the next write', async () => {
    const old = JSON.stringify({ id: 'old', at: new Date(0).toISOString(), event: 'ancient', outcome: 'success' });
    await direct.zadd(AUDIT_KEY, Date.now() - 31 * 86_400_000, old);
    await audit.recordAudit({ event: 'fresh', outcome: 'success' });
    expect((await audit.readAudit(10)).map((event) => event.event)).toEqual(['fresh']);
  });

  it('is capped at the configured number of entries, keeping the newest', async () => {
    for (let n = 0; n < 110; n += 1) await audit.recordAudit({ event: `event-${n}`, outcome: 'success' });
    expect(await direct.zcard(AUDIT_KEY)).toBe(100);
    const newest = await audit.readAudit(1);
    expect(newest[0].event).toBe('event-109');
    expect((await stored())[0].event).toBe('event-10');
  });

  it('skips malformed members when reading and bounds the read size', async () => {
    await direct.zadd(AUDIT_KEY, Date.now() - 20, 'not json');
    await direct.zadd(AUDIT_KEY, Date.now() - 10, JSON.stringify({ no: 'event field' }));
    await audit.recordAudit({ event: 'good', outcome: 'success' });
    expect((await audit.readAudit(100)).map((event) => event.event)).toEqual(['good']);
    expect(await audit.readAudit(-5)).toHaveLength(1);
    const bulk = direct.pipeline();
    for (let n = 0; n < 520; n += 1)
      bulk.zadd(
        AUDIT_KEY,
        Date.now() - 1000 - n,
        JSON.stringify({ id: String(n), at: '', event: `bulk-${n}`, outcome: 'success' }),
      );
    await bulk.exec();
    // 500 rows are read at most; two of them are the malformed members, which are skipped.
    expect(await audit.readAudit(10_000)).toHaveLength(498);
  });

  it('recording never throws when Redis is unreachable', async () => {
    const { createServer } = await import('node:net');
    const probe = createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
    const port = (probe.address() as { port: number }).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    const { createDashboardRedis } = await import('../../src/lib/redis/client');
    (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
    (globalThis as { arrakisRedisClient?: unknown }).arrakisRedisClient = createDashboardRedis(
      `redis://127.0.0.1:${port}/15`,
    );
    await expect(audit.recordAudit({ event: 'while.down', outcome: 'failure' })).resolves.toBeUndefined();
    (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
    delete (globalThis as { arrakisRedisClient?: unknown }).arrakisRedisClient;
    expect(await direct.exists(AUDIT_KEY)).toBe(0);
  });
});
