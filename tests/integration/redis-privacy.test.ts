import type { Redis } from 'ioredis';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import type { PrivacyInput } from '../../src/features/privacy/model';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/privacy/server/store');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/privacy/server/store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
const publish = (revision: string | null = null): PrivacyInput => ({
  action: 'publish',
  revision,
  card: { category: 'profile', data: { displayName: 'Chosen name', about: 'Shared only by consent' } },
  hours: 1,
  confirmed: true,
});
it('starts private, isolates accounts and never publishes a saved draft', async () => {
  const record = await store.mutatePrivacy('owner-a', {
    action: 'save-draft',
    revision: null,
    card: { category: 'profile', data: { displayName: 'Private draft', about: 'Never share this draft' } },
  });
  expect((await store.readPrivacy('owner-b')).drafts.profile.displayName).toBe('');
  await expect(store.readSharedPrivacy(record.shareId!)).rejects.toMatchObject({ statusCode: 404 });
  expect(await direct.ttl(store.privacyOwnerKey('owner-a'))).toBeGreaterThan(89 * 86400);
  await direct.expire(store.privacyOwnerKey('owner-a'), 5);
  await store.readPrivacy('owner-a');
  expect(await direct.ttl(store.privacyOwnerKey('owner-a'))).toBeGreaterThan(89 * 86400);
});
it('projects published snapshots only and expires them at the exact server deadline without extending retention', async () => {
  const record = await store.mutatePrivacy('owner-a', publish());
  const draft = await store.mutatePrivacy('owner-a', {
    action: 'save-draft',
    revision: record.revision,
    card: { category: 'profile', data: { displayName: 'New private text', about: 'Private draft secret' } },
  });
  await direct.expire(store.privacyOwnerKey('owner-a'), 10);
  const view = await store.readSharedPrivacy(draft.shareId!);
  expect(view.cards[0].data).toMatchObject({ displayName: 'Chosen name' });
  expect(JSON.stringify(view)).not.toMatch(/Private draft secret|New private text|shareId|revision|drafts/);
  expect(await direct.ttl(store.privacyOwnerKey('owner-a'))).toBeLessThanOrEqual(10);
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.parse(record.publications.profile!.expiresAt));
  await expect(store.readSharedPrivacy(record.shareId!)).rejects.toMatchObject({ statusCode: 404 });
});
it('atomically fences simultaneous publication, rotation and revocation across same-slot keys', async () => {
  const first = await Promise.allSettled(Array.from({ length: 8 }, () => store.mutatePrivacy('owner-a', publish())));
  expect(first.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const record = await store.readPrivacy('owner-a');
  const changes = await Promise.allSettled([
    store.mutatePrivacy('owner-a', { action: 'rotate-link', revision: record.revision }),
    store.mutatePrivacy('owner-a', { action: 'revoke-all', revision: record.revision }),
    store.mutatePrivacy('owner-a', publish(record.revision)),
  ]);
  expect(changes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const current = await store.readPrivacy('owner-a');
  const revoked = await store.mutatePrivacy('owner-a', { action: 'revoke-all', revision: current.revision });
  expect(revoked.shareId).not.toBe(current.shareId);
  expect(revoked.publications.profile).toBeNull();
  expect(revoked.drafts.profile.displayName).toBe('Chosen name');
  await expect(store.readSharedPrivacy(record.shareId!)).rejects.toMatchObject({ statusCode: 404 });
  await expect(store.readSharedPrivacy(current.shareId!)).rejects.toMatchObject({ statusCode: 404 });
  await expect(store.mutatePrivacy('owner-a', publish(record.revision))).rejects.toMatchObject({ statusCode: 409 });
});
it('replaces links without extending consent and unpublishes one category without leaking other drafts', async () => {
  const profile = await store.mutatePrivacy('owner-a', publish());
  const location = await store.mutatePrivacy('owner-a', {
    action: 'publish',
    revision: profile.revision,
    card: { category: 'location', data: { map: 'Hagga Basin', directions: 'Selected meeting point', note: '' } },
    hours: 24,
    confirmed: true,
  });
  const rotated = await store.mutatePrivacy('owner-a', { action: 'rotate-link', revision: location.revision });
  expect(rotated.publications).toEqual(location.publications);
  await expect(store.readSharedPrivacy(location.shareId!)).rejects.toMatchObject({ statusCode: 404 });
  expect((await store.readSharedPrivacy(rotated.shareId!)).cards).toHaveLength(2);
  const hidden = await store.mutatePrivacy('owner-a', {
    action: 'unpublish',
    revision: rotated.revision,
    category: 'location',
  });
  expect((await store.readSharedPrivacy(hidden.shareId!)).cards.map((c) => c.category)).toEqual(['profile']);
  expect(hidden.drafts.location.directions).toBe('Selected meeting point');
});
it('rejects corrupt/empty/oversized/wrong-type owner records and routing pointers without resetting data', async () => {
  const key = store.privacyOwnerKey('owner-a');
  for (const raw of ['', '{bad', 'x'.repeat(65537), JSON.stringify({ schemaVersion: 99 })]) {
    await direct.set(key, raw);
    await expect(store.readPrivacy('owner-a')).rejects.toMatchObject({ statusCode: 503 });
    await expect(store.mutatePrivacy('owner-a', publish())).rejects.toMatchObject({ statusCode: 503 });
    expect(await direct.get(key)).toBe(raw);
  }
  await direct.del(key);
  await direct.lpush(key, 'wrong');
  await expect(store.readPrivacy('owner-a')).rejects.toMatchObject({ statusCode: 503 });
  await direct.del(key);
  const record = await store.mutatePrivacy('owner-a', publish());
  const link = store.privacyLinkKey(record.shareId!);
  const before = await direct.get(key);
  await direct.set(link, 'f'.repeat(64));
  await expect(
    store.mutatePrivacy('owner-a', { action: 'unpublish', revision: record.revision, category: 'profile' }),
  ).rejects.toMatchObject({ statusCode: 503 });
  expect(await direct.get(key)).toBe(before);
  await direct.set(link, 'x'.repeat(65));
  await expect(store.readSharedPrivacy(record.shareId!)).rejects.toMatchObject({ statusCode: 503 });
});
it('recovers link routing on an explicit owner write and validates confirmation/expiry before persistence', async () => {
  const record = await store.mutatePrivacy('owner-a', publish());
  await direct.del(store.privacyLinkKey(record.shareId!));
  await expect(store.readSharedPrivacy(record.shareId!)).rejects.toMatchObject({ statusCode: 404 });
  const next = await store.mutatePrivacy('owner-a', {
    action: 'save-draft',
    revision: record.revision,
    card: { category: 'profile', data: { displayName: 'Private revision', about: '' } },
  });
  expect((await store.readSharedPrivacy(next.shareId!)).cards[0].data).toMatchObject({ displayName: 'Chosen name' });
  await expect(
    store.mutatePrivacy('owner-b', { ...publish(), confirmed: false } as unknown as PrivacyInput),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect((await store.readPrivacy('owner-b')).revision).toBeNull();
});
