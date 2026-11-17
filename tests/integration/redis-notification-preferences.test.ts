import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { defaultNotifications } from '../../src/features/inbox/preferences';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/inbox/server/preferences-store');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/inbox/server/preferences-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  vi.useRealTimers();
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
const configure = (revision: string | null = null) => ({
  action: 'configure' as const,
  revision,
  config: defaultNotifications().config,
});
it('isolates account settings, has no character dependency and refreshes bounded retention', async () => {
  const first = await store.mutateNotifications('one', configure());
  expect(await store.readNotifications('one')).toEqual(first);
  expect(await store.readNotifications('two')).toEqual(defaultNotifications());
  const key = store.notificationKey('one');
  expect(key).not.toContain('one');
  expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  await direct.expire(key, 5);
  await store.readNotifications('one');
  expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
});
it('serializes concurrent first writes, preferences and alert actions with UUID CAS', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.mutateNotifications('one', configure())),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const record = await store.readNotifications('one');
  const updates = await Promise.allSettled([
    store.mutateNotifications('one', configure(record.revision)),
    store.mutateNotifications('one', { action: 'snooze', revision: record.revision, id: 'a'.repeat(64), minutes: 60 }),
  ]);
  expect(updates.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  await expect(store.mutateNotifications('one', configure(record.revision))).rejects.toMatchObject({ statusCode: 409 });
});
it('uses server time for snooze/review and restores a record without losing its revision', async () => {
  const before = Date.now();
  const id = 'a'.repeat(64);
  const snoozed = await store.mutateNotifications('one', { action: 'snooze', revision: null, id, minutes: 60 });
  expect(Date.parse(snoozed.states[0].snoozedUntil!)).toBeGreaterThanOrEqual(before + 3600000);
  expect(Date.parse(snoozed.states[0].snoozedUntil!)).toBeLessThanOrEqual(Date.now() + 3600000);
  const reviewed = await store.mutateNotifications('one', { action: 'review', revision: snoozed.revision, id });
  expect(reviewed.states[0].snoozedUntil).toBeNull();
  expect(reviewed.states[0].seenAt).not.toBeNull();
  const dismissed = await store.mutateNotifications('one', {
    action: 'dismiss',
    revision: reviewed.revision,
    id,
    fingerprint: 'b'.repeat(64),
  });
  expect(dismissed.states[0].dismissed).toBe('b'.repeat(64));
  const restored = await store.mutateNotifications('one', { action: 'restore', revision: dismissed.revision, id });
  expect(restored.states).toEqual([]);
  expect(restored.revision).not.toBeNull();
  await expect(store.mutateNotifications('one', configure(null))).rejects.toMatchObject({ statusCode: 409 });
});
it('bounds historical controls to the 120 most recently touched identifiers', async () => {
  let revision: string | null = null;
  for (let i = 0; i < 121; i++)
    revision = (
      await store.mutateNotifications('one', { action: 'review', revision, id: i.toString(16).padStart(64, '0') })
    ).revision;
  const record = await store.readNotifications('one');
  expect(record.states).toHaveLength(120);
  expect(record.states[0].id).toBe('1'.padStart(64, '0'));
  expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThan(65536);
});
it('refuses malformed, oversized and wrong-type data without resetting or overwriting it', async () => {
  const key = store.notificationKey('one');
  for (const raw of [
    '{bad',
    'x'.repeat(65537),
    JSON.stringify({ ...defaultNotifications(), revision: randomUUID(), states: [{ id: 'foreign' }] }),
  ]) {
    await direct.set(key, raw);
    await expect(store.readNotifications('one')).rejects.toMatchObject({ statusCode: 503 });
    await expect(store.mutateNotifications('one', configure())).rejects.toMatchObject({ statusCode: 503 });
    expect(await direct.get(key)).toBe(raw);
  }
  await direct.del(key);
  await direct.lpush(key, 'bad');
  await expect(store.readNotifications('one')).rejects.toMatchObject({ statusCode: 503 });
});
