import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import { operationsView, type OperationDraft, type StoredOperation } from '../../src/features/guilds/operations';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/operations-store');
const leader = { memberId: 'leader', authorName: 'Leader', canEdit: true };
const member = (id: string) => ({ memberId: id, authorName: id, canEdit: false });
function draft(
  roles: OperationDraft['roles'] = [
    { role: 'pilot', capacity: 1 },
    { role: 'scout', capacity: 2 },
  ],
): OperationDraft {
  return {
    id: randomUUID(),
    title: 'Spice run',
    kind: 'spice-run',
    details: 'Bring water.',
    meetingPoint: 'South base',
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 10_800_000).toISOString(),
    roles,
  };
}
async function create(guild = '2', operation = draft()) {
  return store.mutateGuildOperation(guild, { action: 'save', revision: null, operation }, leader);
}
const join = (operation: StoredOperation, id: string, role: 'pilot' | 'scout' = 'pilot') =>
  store.mutateGuildOperation('2', { action: 'join', id: operation.id, revision: operation.revision, role }, member(id));
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/operations-store');
});
beforeEach(async () => {
  vi.restoreAllMocks();
  await direct.flushdb();
});
afterAll(async () => {
  vi.restoreAllMocks();
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('guild operations Redis storage', () => {
  it('isolates guilds and retains future schedules beyond their end plus 90 days', async () => {
    const future = draft();
    future.startsAt = new Date(Date.now() + 180 * 86_400_000).toISOString();
    future.endsAt = new Date(Date.parse(future.startsAt) + 3_600_000).toISOString();
    await create('2', future);
    expect(await store.readGuildOperations('3')).toEqual([]);
    expect((await store.readGuildOperations('2'))[0].title).toBe('Spice run');
    const ttl = await direct.ttl(guildKeys.operations('2'));
    expect(ttl).toBeGreaterThan(269 * 86_400);
    await direct.expire(guildKeys.operations('2'), 60);
    await store.readGuildOperations('2');
    expect(await direct.ttl(guildKeys.operations('2'))).toBeLessThanOrEqual(60);
  });
  it('reserves the last role slot once under concurrent signups', async () => {
    const operation = await create();
    const attempts = await Promise.allSettled([join(operation, 'one'), join(operation, 'two')]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const [current] = await store.readGuildOperations('2');
    expect(current.signups).toHaveLength(1);
    await expect(join(current, 'third')).rejects.toMatchObject({ code: 'OPERATION_ROLE_FULL' });
    expect(JSON.stringify(operationsView([current], 'third', false))).not.toContain('memberId');
  });
  it('switches roles and withdraws without duplicating a member or removing someone else', async () => {
    let operation = await join(await create(), 'one');
    const signupId = operation.signups[0].id;
    operation = await join(operation, 'one', 'scout');
    expect(operation.signups).toHaveLength(1);
    expect(operation.signups[0].id).toBe(signupId);
    operation = await join(operation, 'two');
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'leave', id: operation.id, revision: operation.revision },
      member('one'),
    );
    expect(operation.signups.map((entry) => entry.memberId)).toEqual(['two']);
  });
  it('protects occupied capacities and lets a leader remove a signup before changing slots', async () => {
    let operation = await join(await create(), 'one');
    const changed = { ...draft([{ role: 'scout', capacity: 1 }]), id: operation.id };
    await expect(
      store.mutateGuildOperation('2', { action: 'save', revision: operation.revision, operation: changed }, leader),
    ).rejects.toMatchObject({ code: 'OPERATION_CAPACITY_CONFLICT' });
    const remove = {
      action: 'remove-signup' as const,
      id: operation.id,
      revision: operation.revision,
      signupId: operation.signups[0].id,
    };
    await expect(store.mutateGuildOperation('2', remove, member('two'))).rejects.toMatchObject({ statusCode: 403 });
    operation = await store.mutateGuildOperation('2', remove, leader);
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'save', revision: operation.revision, operation: changed },
      leader,
    );
    expect(operation.roles).toEqual([{ role: 'scout', capacity: 1 }]);
  });
  it('closes signup at the start and refuses member management of closed operations', async () => {
    let operation = await create();
    const actualNow = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(actualNow + 3_600_001);
    await expect(join(operation, 'late')).rejects.toMatchObject({ code: 'OPERATION_CLOSED' });
    clock.mockRestore();
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'status', id: operation.id, revision: operation.revision, status: 'cancelled' },
        member('one'),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'status', id: operation.id, revision: operation.revision, status: 'completed' },
      leader,
    );
    await expect(join(operation, 'late')).rejects.toMatchObject({ code: 'OPERATION_CLOSED' });
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'save', revision: operation.revision, operation: { ...draft(), id: operation.id } },
        leader,
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_CLOSED' });
  });
  it('enforces operation limits, stale revisions and deletion without resurrecting old writes', async () => {
    const first = await create();
    for (let index = 1; index < 20; index++) await create();
    await expect(create()).rejects.toMatchObject({ code: 'OPERATIONS_FULL' });
    await store.mutateGuildOperation('2', { action: 'delete', id: first.id, revision: first.revision }, leader);
    await expect(join(first, 'stale')).rejects.toMatchObject({ code: 'OPERATIONS_CONFLICT' });
    await create();
    expect(await store.readGuildOperations('2')).toHaveLength(20);
  });
  it('rejects invalid times and corrupt storage, and removes plans on disband', async () => {
    const past = draft();
    past.startsAt = new Date(Date.now() - 60_000).toISOString();
    await expect(create('2', past)).rejects.toMatchObject({ code: 'INVALID_OPERATION_TIME' });
    await direct.hset(guildKeys.operations('2'), randomUUID(), 'x'.repeat(65_537));
    await expect(store.readGuildOperations('2')).rejects.toMatchObject({ code: 'OPERATIONS_UNAVAILABLE' });
    await direct.del(guildKeys.operations('2'));
    await create();
    const { removeGuildStorage } = await import('../../src/features/guilds/server/membership');
    await removeGuildStorage('2');
    expect(await direct.exists(guildKeys.operations('2'))).toBe(0);
  });
});
