import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import {
  resourceProgress,
  resourceRequestsView,
  type ResourceDraft,
  type StoredResourceRequest,
} from '../../src/features/guilds/resource-requests';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/resource-requests-store');
const actor = (id: string, canEdit = false) => ({ memberId: id, authorName: `Member ${id}`, canEdit });
const requester = actor('requester');
const leader = actor('leader', true);
const draft = (quantity = '100'): ResourceDraft => ({
  id: randomUUID(),
  material: 'Steel',
  quantity,
  unit: 'ingots',
  dropoff: 'Base',
  details: '',
  priority: 'normal',
});
const create = (owner = requester, request = draft(), guild = '2') =>
  store.mutateResourceRequest(guild, { action: 'save', revision: null, request }, owner);
const pledge = (request: StoredResourceRequest, supplier: string, quantity = '50') =>
  store.mutateResourceRequest(
    '2',
    { action: 'pledge', id: request.id, revision: request.revision, quantity },
    actor(supplier),
  );
const report = (request: StoredResourceRequest, supplier: string) =>
  store.mutateResourceRequest('2', { action: 'report', id: request.id, revision: request.revision }, actor(supplier));
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/resource-requests-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('guild resource request Redis storage', () => {
  it('isolates guilds, persists exact large quantities and does not refresh retention on reads', async () => {
    const created = await create(requester, draft('900719925474099312'));
    const reserved = await pledge(created, 'large-supplier', '900719925474099311');
    expect(resourceProgress(reserved)).toEqual({ committed: '900719925474099311', delivered: '0', unpledged: '1' });
    expect((await store.readResourceRequests('2'))[0].quantity).toBe('900719925474099312');
    expect(await store.readResourceRequests('3')).toEqual([]);
    const ttl = await direct.ttl(guildKeys.resourceRequests('2'));
    expect(ttl).toBeGreaterThan(7_775_990);
    await direct.expire(guildKeys.resourceRequests('2'), 60);
    await store.readResourceRequests('2');
    expect(await direct.ttl(guildKeys.resourceRequests('2'))).toBeLessThanOrEqual(60);
  });
  it('allows only one concurrent pledge for the remaining quantity', async () => {
    const request = await create(requester, draft('50'));
    const attempts = await Promise.allSettled([pledge(request, 'one'), pledge(request, 'two')]);
    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const [current] = await store.readResourceRequests('2');
    expect(resourceProgress(current).committed).toBe('50');
    await expect(pledge(current, 'three', '1')).rejects.toMatchObject({ code: 'RESOURCE_OVERCOMMITTED' });
  });
  it('updates one outstanding pledge per character, preserves receipts and supports further partial deliveries', async () => {
    let request = await pledge(await create(), 'supplier', '30');
    const id = request.pledges[0].id;
    request = await pledge(request, 'supplier', '40');
    expect(request.pledges).toHaveLength(1);
    expect(request.pledges[0].id).toBe(id);
    await expect(
      store.mutateResourceRequest(
        '2',
        { action: 'confirm', id: request.id, revision: request.revision, pledgeId: id },
        requester,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_NOT_REPORTED' });
    request = await report(request, 'supplier');
    expect(resourceProgress(request).delivered).toBe('0');
    request = await store.mutateResourceRequest(
      '2',
      { action: 'confirm', id: request.id, revision: request.revision, pledgeId: id },
      requester,
    );
    request = await pledge(request, 'supplier', '60');
    await expect(
      store.mutateResourceRequest(
        '2',
        { action: 'release-pledge', id: request.id, revision: request.revision, pledgeId: id },
        requester,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_PLEDGE_LOCKED' });
    expect(request.pledges).toHaveLength(2);
    expect(resourceProgress(request)).toEqual({ committed: '100', delivered: '40', unpledged: '0' });
    expect(JSON.stringify(resourceRequestsView([request], 'supplier', false))).not.toMatch(
      /requesterId|supplierId|confirmedById/,
    );
  });
  it('separates supplier reports from receipt confirmation and refuses self-confirmation by a leader', async () => {
    let request = await pledge(await create(), 'leader', '100');
    request = await report(request, 'leader');
    const pledgeId = request.pledges[0].id;
    await expect(
      store.mutateResourceRequest(
        '2',
        { action: 'confirm', id: request.id, revision: request.revision, pledgeId },
        leader,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_SELF_CONFIRMATION' });
    await expect(
      store.mutateResourceRequest(
        '2',
        { action: 'confirm', id: request.id, revision: request.revision, pledgeId },
        actor('outsider'),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    request = await store.mutateResourceRequest(
      '2',
      { action: 'confirm', id: request.id, revision: request.revision, pledgeId },
      requester,
    );
    expect(request.status).toBe('fulfilled');
    expect(resourceProgress(request).delivered).toBe('100');
    await expect(pledge(request, 'late', '1')).rejects.toMatchObject({ code: 'RESOURCE_CLOSED' });
  });
  it('returns a claim to promised, withdraws only the supplier pledge and releases departed volunteers', async () => {
    let request = await pledge(await create(), 'one');
    request = await pledge(request, 'two');
    request = await report(request, 'one');
    request = await store.mutateResourceRequest(
      '2',
      { action: 'return-claim', id: request.id, revision: request.revision, pledgeId: request.pledges[0].id },
      requester,
    );
    request = await store.mutateResourceRequest(
      '2',
      { action: 'withdraw', id: request.id, revision: request.revision },
      actor('one'),
    );
    expect(request.pledges.map((entry) => entry.supplierId)).toEqual(['two']);
    request = await store.mutateResourceRequest(
      '2',
      { action: 'release-pledge', id: request.id, revision: request.revision, pledgeId: request.pledges[0].id },
      leader,
    );
    expect(request.pledges).toHaveLength(0);
  });
  it('restricts edits and closures to requester/leader and protects committed materials and quantities', async () => {
    let request = await pledge(await create(), 'supplier');
    const changed = { ...draft('40'), id: request.id };
    await expect(
      store.mutateResourceRequest(
        '2',
        { action: 'save', revision: request.revision, request: changed },
        actor('other'),
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      store.mutateResourceRequest('2', { action: 'save', revision: request.revision, request: changed }, requester),
    ).rejects.toMatchObject({ code: 'RESOURCE_OVERCOMMITTED' });
    await expect(
      store.mutateResourceRequest(
        '2',
        { action: 'save', revision: request.revision, request: { ...changed, quantity: '100', material: 'Iron' } },
        leader,
      ),
    ).rejects.toMatchObject({ code: 'RESOURCE_PLEDGES_EXIST' });
    await expect(pledge(request, 'requester', '1')).rejects.toMatchObject({ code: 'RESOURCE_SELF_PLEDGE' });
    request = await store.mutateResourceRequest(
      '2',
      { action: 'cancel', id: request.id, revision: request.revision },
      requester,
    );
    expect(request.status).toBe('cancelled');
    await expect(report(request, 'supplier')).rejects.toMatchObject({ code: 'RESOURCE_CLOSED' });
  });
  it('enforces per-character open quotas atomically and a guild-wide record limit', async () => {
    for (let index = 0; index < 4; index++) await create();
    const attempts = await Promise.allSettled([create(), create()]);
    expect(attempts.filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    for (let index = 5; index < 20; index++) await create(actor(`owner-${index}`));
    await expect(create(actor('last'))).rejects.toMatchObject({ code: 'RESOURCES_FULL' });
    const [first] = await store.readResourceRequests('2');
    await store.mutateResourceRequest('2', { action: 'delete', id: first.id, revision: first.revision }, leader);
    await create(actor('last'));
    expect(await store.readResourceRequests('2')).toHaveLength(20);
  });
  it('caps retained pledge records, rejects stale revisions and cleans up on disband', async () => {
    let request = await create();
    const stale = request;
    for (let index = 0; index < 20; index++) request = await pledge(request, `supplier-${index}`, '1');
    await expect(pledge(request, 'extra', '1')).rejects.toMatchObject({ code: 'RESOURCE_PLEDGES_FULL' });
    await expect(pledge(stale, 'stale', '1')).rejects.toMatchObject({ code: 'RESOURCE_CONFLICT' });
    const { removeGuildStorage } = await import('../../src/features/guilds/server/membership');
    await removeGuildStorage('2');
    expect(await direct.exists(guildKeys.resourceRequests('2'))).toBe(0);
  });
  it('fails closed on corrupt and oversized storage without overwriting records', async () => {
    const id = randomUUID();
    await direct.hset(guildKeys.resourceRequests('2'), id, 'x'.repeat(65_537));
    await expect(store.readResourceRequests('2')).rejects.toMatchObject({ code: 'RESOURCES_UNAVAILABLE' });
    await expect(create()).rejects.toMatchObject({ code: 'RESOURCES_UNAVAILABLE' });
    expect(await direct.hstrlen(guildKeys.resourceRequests('2'), id)).toBe(65_537);
  });
});
