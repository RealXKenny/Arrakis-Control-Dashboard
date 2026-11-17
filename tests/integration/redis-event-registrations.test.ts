import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { communityEventKeys } from '../../src/lib/redis/keys';
import type { CommunityEvent } from '../../src/features/events/contracts';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let events: typeof import('../../src/features/events/server/store');
let registrations: typeof import('../../src/features/events/server/registrations-store');
let event: CommunityEvent;
beforeAll(async () => {
  direct = connectDirect(target);
  events = await import('../../src/features/events/server/store');
  registrations = await import('../../src/features/events/server/registrations-store');
});
beforeEach(async () => {
  await direct.flushdb();
  const [seed] = await events.listCommunityEvents();
  event = await events.saveCommunityEvent(
    seed.id,
    {
      ...seed,
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      endsAt: new Date(Date.now() + 7200000).toISOString(),
      status: 'open',
    },
    seed.revision,
  );
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

it('prevents duplicate registrations, isolates member status and supports explicit cancellation', async () => {
  const first = await registrations.mutateEventRegistration(event, { action: 'register', revision: null }, 'owner-a');
  expect(first.ownStatus).toBe('registered');
  const repeated = await registrations.mutateEventRegistration(
    event,
    { action: 'register', revision: first.revision },
    'owner-a',
  );
  expect(repeated.revision).toBe(first.revision);
  await expect(
    registrations.mutateEventRegistration(event, { action: 'register', revision: null }, 'owner-b'),
  ).rejects.toMatchObject({ statusCode: 409 });
  const other = await registrations.getEventRegistration(event, 'owner-b');
  expect(other.ownStatus).toBeNull();
  expect(JSON.stringify(other)).not.toContain('owner-a');
  expect(await direct.ttl(communityEventKeys.registration(event.id))).toBeGreaterThan(89 * 86400);
  const cancelled = await registrations.mutateEventRegistration(
    event,
    { action: 'cancel', revision: first.revision },
    'owner-a',
  );
  expect(cancelled.ownStatus).toBeNull();
});

it('serializes the last seat and promotes the earliest waiting member exactly once', async () => {
  const revision = randomUUID();
  const entries: Record<string, string> = { __revision: revision };
  for (let index = 0; index < 99; index++)
    entries[`seat-${index}`] = JSON.stringify({ status: 'registered', joinedAt: '2026-11-15T00:00:00Z' });
  await direct.hset(communityEventKeys.registration(event.id), entries);
  const results = await Promise.allSettled([
    registrations.mutateEventRegistration(event, { action: 'register', revision }, 'owner-a'),
    registrations.mutateEventRegistration(event, { action: 'register', revision }, 'owner-b'),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  const winner = results.findIndex((result) => result.status === 'fulfilled');
  const winnerOwner = winner === 0 ? 'owner-a' : 'owner-b';
  const loserOwner = winner === 0 ? 'owner-b' : 'owner-a';
  const current = await registrations.getEventRegistration(event, loserOwner);
  expect(current.registered).toBe(100);
  const waiting = await registrations.mutateEventRegistration(
    event,
    { action: 'register', revision: current.revision },
    loserOwner,
  );
  expect(waiting).toMatchObject({ ownStatus: 'waiting', ownWaitlistPosition: 1, registered: 100, waiting: 1 });
  await registrations.mutateEventRegistration(event, { action: 'cancel', revision: waiting.revision }, winnerOwner);
  expect(await registrations.getEventRegistration(event, loserOwner)).toMatchObject({
    ownStatus: 'registered',
    registered: 100,
    waiting: 0,
  });
});

it('fails closed at capacity, on cancellation and after the deadline without promoting waiters', async () => {
  const revision = randomUUID();
  const entries: Record<string, string> = {
    __revision: revision,
    seated: JSON.stringify({ status: 'registered', joinedAt: '2026-11-15T00:00:00Z' }),
    waiter: JSON.stringify({ status: 'waiting', joinedAt: '2026-11-15T00:01:00Z' }),
  };
  for (let index = 0; index < 99; index++)
    entries[`seat-${index}`] = JSON.stringify({ status: 'registered', joinedAt: '2026-11-15T00:00:00Z' });
  for (let index = 0; index < 99; index++)
    entries[`wait-${index}`] = JSON.stringify({ status: 'waiting', joinedAt: '2026-11-15T00:02:00Z' });
  await direct.hset(communityEventKeys.registration(event.id), entries);
  await expect(
    registrations.mutateEventRegistration(event, { action: 'register', revision }, 'overflow'),
  ).rejects.toMatchObject({ statusCode: 409, code: 'REGISTRATION_FULL' });
  const cancelled = await events.saveCommunityEvent(event.id, { ...event, status: 'cancelled' }, event.revision);
  await expect(
    registrations.mutateEventRegistration(cancelled, { action: 'register', revision }, 'new-owner'),
  ).rejects.toMatchObject({ statusCode: 409, code: 'REGISTRATION_CLOSED' });
  await registrations.mutateEventRegistration(cancelled, { action: 'cancel', revision }, 'seated');
  expect(await registrations.getEventRegistration(cancelled, 'waiter')).toMatchObject({
    ownStatus: 'waiting',
    waiting: 100,
  });
});
