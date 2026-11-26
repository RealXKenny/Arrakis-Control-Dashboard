import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import type { OperationDraft, StoredOperation } from '../../src/features/guilds/operations';
import { availabilityDocumentSchema } from '../../src/features/guilds/availability';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/operations-store');
let logistics: typeof import('../../src/features/guilds/server/logistics-store');
const leader = { memberId: 'leader', authorName: 'Leader', canEdit: true };
const member = (id: string) => ({ memberId: id, authorName: id, canEdit: false });
const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);

function draft(start = Date.now() + 3_600_000): OperationDraft {
  return {
    id: randomUUID(),
    title: 'Spice run',
    kind: 'spice-run',
    details: '',
    meetingPoint: 'South base',
    startsAt: new Date(start).toISOString(),
    endsAt: new Date(start + 7_200_000).toISOString(),
    roles: [{ role: 'pilot', capacity: 1 }],
    preparation: [{ id: randomUUID(), text: 'Fuel' }],
  };
}
const ref = (operation: StoredOperation) => ({ id: operation.id, revision: operation.revision });
async function current(id: string) {
  return (await store.readGuildOperations('2')).find((entry) => entry.id === id)!;
}

beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/operations-store');
  logistics = await import('../../src/features/guilds/server/logistics-store');
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

describe('guild operation waitlists and reports in Redis', () => {
  it('offers a freed seat to the earliest waiter, who must accept before holding it', async () => {
    let operation = await store.mutateGuildOperation(
      '2',
      { action: 'save', revision: null, operation: draft() },
      leader,
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'join', ...ref(operation), role: 'pilot' },
      member('a'),
    );
    await expect(
      store.mutateGuildOperation('2', { action: 'join', ...ref(operation), role: 'pilot' }, member('b')),
    ).rejects.toMatchObject({ code: 'OPERATION_ROLE_FULL' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'waitlist-join', ...ref(operation), role: 'pilot' },
      member('b'),
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'waitlist-join', ...ref(operation), role: 'pilot' },
      member('c'),
    );
    operation = await store.mutateGuildOperation('2', { action: 'leave', ...ref(operation) }, member('a'));
    expect(operation.signups).toEqual([]);
    expect(operation.invitations?.map((entry) => entry.memberId)).toEqual(['b']);
    // The held seat blocks a direct join by someone further back in line.
    await expect(
      store.mutateGuildOperation('2', { action: 'join', ...ref(operation), role: 'pilot' }, member('c')),
    ).rejects.toMatchObject({ code: 'OPERATION_ROLE_FULL' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'invitation', ...ref(operation), decision: 'decline' },
      member('b'),
    );
    expect(operation.invitations?.map((entry) => entry.memberId)).toEqual(['c']);
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'invitation', ...ref(operation), decision: 'accept' },
      member('c'),
    );
    expect(operation.signups.map((entry) => entry.memberId)).toEqual(['c']);
    expect(operation.invitations).toEqual([]);
    expect(operation.waitlist).toEqual([]);
  });
  it('persists a lapsed invitation once on read so its expiry does not move', async () => {
    let operation = await store.mutateGuildOperation(
      '2',
      { action: 'save', revision: null, operation: draft() },
      leader,
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'join', ...ref(operation), role: 'pilot' },
      member('a'),
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'waitlist-join', ...ref(operation), role: 'pilot' },
      member('b'),
    );
    // A leader removal frees the seat; the read path persists the offer with a fixed expiry.
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'remove-signup', ...ref(operation), signupId: operation.signups[0].id },
      leader,
    );
    const first = (await store.readSettledOperations('2'))[0];
    const second = (await store.readSettledOperations('2'))[0];
    expect(first.invitations?.[0].expiresAt).toBe(operation.invitations?.[0].expiresAt);
    expect(second.invitations?.[0].expiresAt).toBe(first.invitations?.[0].expiresAt);
  });
  it('limits readiness to signed-up members and drops ticks for removed preparation items', async () => {
    const input = draft();
    let operation = await store.mutateGuildOperation('2', { action: 'save', revision: null, operation: input }, leader);
    const readiness = { status: 'partial' as const, checked: [input.preparation![0].id], note: 'Low on fuel' };
    await expect(
      store.mutateGuildOperation('2', { action: 'readiness', ...ref(operation), readiness }, member('a')),
    ).rejects.toMatchObject({ code: 'OPERATION_FORBIDDEN' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'join', ...ref(operation), role: 'pilot' },
      member('a'),
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'readiness', ...ref(operation), readiness },
      member('a'),
    );
    expect(operation.signups[0].readiness).toMatchObject({ status: 'partial', note: 'Low on fuel' });
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'readiness', ...ref(operation), readiness: { ...readiness, checked: [randomUUID()] } },
        member('a'),
      ),
    ).rejects.toMatchObject({ code: 'OPERATIONS_CONFLICT' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'save', revision: operation.revision, operation: { ...input, preparation: [] } },
      leader,
    );
    expect(operation.signups[0].readiness?.checked).toEqual([]);
  });
  it('validates convoy crews against current sign-ups', async () => {
    let operation = await store.mutateGuildOperation(
      '2',
      { action: 'save', revision: null, operation: draft() },
      leader,
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'join', ...ref(operation), role: 'pilot' },
      member('a'),
    );
    const vehicle = {
      id: randomUUID(),
      fleetVehicleId: null,
      vehicleLabel: 'Carrier',
      crew: [operation.signups[0].id],
      cargo: [{ item: 'Water', quantity: '500' }],
      destination: '',
      waypointId: null,
    };
    await expect(
      store.mutateGuildOperation('2', { action: 'convoy', ...ref(operation), convoy: [vehicle] }, member('a')),
    ).rejects.toMatchObject({ code: 'GUILD_LEADER_REQUIRED' });
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'convoy', ...ref(operation), convoy: [{ ...vehicle, crew: [randomUUID()] }] },
        leader,
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_CONVOY_INVALID' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'convoy', ...ref(operation), convoy: [vehicle] },
      leader,
    );
    // Removing a sign-up also removes them from the convoy crew.
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'remove-signup', ...ref(operation), signupId: operation.signups[0].id },
      leader,
    );
    expect(operation.convoy?.[0].crew).toEqual([]);
  });
  it('opens reports after the end and stores screenshots atomically with the record', async () => {
    let operation = await store.mutateGuildOperation(
      '2',
      { action: 'save', revision: null, operation: draft() },
      leader,
    );
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'report', ...ref(operation), report: { outcome: 'success', summary: '', lessons: [] } },
        leader,
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_NOT_REVIEWABLE' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'join', ...ref(operation), role: 'pilot' },
      member('a'),
    );
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'status', ...ref(operation), status: 'completed' },
      leader,
    );
    operation = await store.mutateGuildOperation(
      '2',
      {
        action: 'report',
        ...ref(operation),
        report: { outcome: 'partial', summary: 'Worm sign.', lessons: ['Scout earlier'] },
      },
      leader,
    );
    expect(operation.report).toMatchObject({ outcome: 'partial', authorName: 'Leader' });
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'follow-up', ...ref(operation), text: 'Repair carrier' },
        member('outsider'),
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_FORBIDDEN' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'follow-up', ...ref(operation), text: 'Repair carrier' },
      member('a'),
    );
    const followUpId = operation.followUps![0].id;
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'follow-up-review', ...ref(operation), followUpId, status: 'done' },
        leader,
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_FOLLOW_UP_INVALID' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'follow-up-review', ...ref(operation), followUpId, status: 'accepted' },
      leader,
    );
    expect(operation.followUps![0].status).toBe('accepted');

    const shot = randomUUID();
    await expect(
      store.addOperationScreenshot(
        '2',
        operation.id,
        operation.revision,
        { id: shot, caption: '', bytes: webp },
        member('outsider'),
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_FORBIDDEN' });
    operation = await store.addOperationScreenshot(
      '2',
      operation.id,
      operation.revision,
      { id: shot, caption: 'Loot', bytes: webp },
      member('a'),
    );
    expect(await store.readOperationScreenshot('2', operation.id, shot)).toEqual(webp);
    await expect(
      store.mutateGuildOperation(
        '2',
        { action: 'screenshot-remove', ...ref(operation), screenshotId: shot },
        member('b'),
      ),
    ).rejects.toMatchObject({ code: 'OPERATION_FORBIDDEN' });
    operation = await store.mutateGuildOperation(
      '2',
      { action: 'screenshot-remove', ...ref(operation), screenshotId: shot },
      member('a'),
    );
    expect(await store.readOperationScreenshot('2', operation.id, shot)).toBeNull();
    const again = randomUUID();
    operation = await store.addOperationScreenshot(
      '2',
      operation.id,
      operation.revision,
      { id: again, caption: '', bytes: webp },
      leader,
    );
    await store.mutateGuildOperation('2', { action: 'delete', ...ref(operation) }, leader);
    expect(await direct.exists(guildKeys.operationScreenshots('2'))).toBe(0);
    expect(await current(operation.id)).toBeUndefined();
  });
});

describe('guild logistics documents in Redis', () => {
  const entry = (memberId: string) => ({
    id: randomUUID(),
    memberId,
    name: memberId,
    timeZone: 'UTC',
    windows: [{ day: 1, start: '18:00', end: '20:00' }],
    note: '',
    updatedAt: new Date().toISOString(),
  });
  it('enforces compare-and-set, retention and deletion', async () => {
    const first = await logistics.writeLogistics('2', 'availability', availabilityDocumentSchema, null, {
      entries: [entry('a')],
    });
    await expect(
      logistics.writeLogistics('2', 'availability', availabilityDocumentSchema, null, { entries: [] }),
    ).rejects.toMatchObject({ code: 'LOGISTICS_CONFLICT' });
    expect((await logistics.readLogistics('2', 'availability', availabilityDocumentSchema))?.revision).toBe(first);
    expect(await direct.ttl(guildKeys.logistics('2', 'availability'))).toBeGreaterThan(89 * 86_400);
    expect(await logistics.readLogistics('3', 'availability', availabilityDocumentSchema)).toBeNull();
    await logistics.writeLogistics('2', 'availability', availabilityDocumentSchema, first, null);
    expect(await direct.exists(guildKeys.logistics('2', 'availability'))).toBe(0);
  });
  it('retries own-entry updates against concurrent writers without losing either change', async () => {
    const results = await Promise.all(
      ['a', 'b', 'c'].map((id) =>
        logistics.updateOwnLogistics(
          '2',
          'availability',
          availabilityDocumentSchema,
          (document) => ({
            entries: [...(document?.entries ?? []).filter((item) => item.memberId !== id), entry(id)],
          }),
          5,
        ),
      ),
    );
    expect(results).toHaveLength(3);
    const stored = await logistics.readLogistics('2', 'availability', availabilityDocumentSchema);
    expect(stored?.entries.map((item) => item.memberId).sort()).toEqual(['a', 'b', 'c']);
  });
  it('fails closed on corrupt documents instead of resetting them', async () => {
    await direct.set(guildKeys.logistics('2', 'fleet'), '{"revision":5}');
    const { fleetDocumentSchema } = await import('../../src/features/guilds/fleet');
    await expect(logistics.readLogistics('2', 'fleet', fleetDocumentSchema)).rejects.toMatchObject({
      code: 'LOGISTICS_UNAVAILABLE',
    });
    await expect(
      logistics.writeLogistics('2', 'fleet', fleetDocumentSchema, null, { vehicles: [], reservations: [] }),
    ).rejects.toMatchObject({ code: 'LOGISTICS_UNAVAILABLE' });
  });
});
