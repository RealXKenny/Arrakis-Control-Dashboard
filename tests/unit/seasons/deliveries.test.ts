import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createSeasonFixture } from '../../helpers/seasons-redis.mjs';
import { seasonTemplate } from '../../../src/features/seasons/contracts';
const mock = vi.hoisted(() => ({
  reply: null as ReturnType<typeof createSeasonFixture>,
  enabled: true,
  linked: vi.fn(),
  grant: vi.fn(),
  balance: vi.fn(),
}));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    command: async ([op, key, ...args]: (string | number)[]) =>
      mock.reply(String(op), String(key), args.map(String))?.value,
    eval: async (script: string, keys: string[], args: (string | number)[]) =>
      mock.reply('EVAL', script, [String(keys.length), ...keys, ...args.map(String)])?.value,
  }),
}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mock.linked }));
vi.mock('../../../src/features/seasons/server/delivery-gateway', () => ({
  deliveryAvailable: () => mock.enabled,
  offline: (v: unknown) => v === 'Offline',
  deliveryGateway: { grant: mock.grant, balance: mock.balance },
}));
import { saveSeason, transitionSeason, claimReward } from '../../../src/features/seasons/server/engine';
import { commit, seasonKeys } from '../../../src/features/seasons/server/store';
import {
  requestDelivery,
  reviewDelivery,
  executeDelivery,
  recoverDelivery,
  resolveDelivery,
  deliveryRecords,
  ownDeliveryStatuses,
} from '../../../src/features/seasons/server/deliveries';
beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  mock.reply = createSeasonFixture();
  mock.enabled = true;
  mock.linked.mockResolvedValue({ linked: true, pawnId: '42', controllerId: '43', onlineStatus: 'Offline' });
  mock.grant.mockResolvedValue('delivered');
  mock.balance.mockResolvedValue(1000n);
});
async function setup(item = false) {
  const definition = seasonTemplate();
  definition.startsAt = new Date(Date.now() - 3600000).toISOString();
  definition.rewards[0].gameReward = item
    ? { type: 'item', itemId: 'IronOre', quantity: 10, quality: 0 }
    : { type: 'solaris', amount: '100' };
  const draft = await saveSeason(randomUUID(), '', definition, 'creator');
  const season = await transitionSeason(draft.id, draft.revision, 'publish', 'creator');
  await claimReward(season.id, 'member', 'wayfarer');
  const delivery = await requestDelivery(season.id, 'member', 'wayfarer', 'Verified free season reward.', 'requester');
  return { season, delivery };
}
async function approved(item = false) {
  const { season, delivery } = await setup(item);
  return {
    season,
    delivery: await reviewDelivery(
      season.id,
      delivery.id,
      delivery.revision!,
      true,
      'Verified eligibility.',
      'reviewer',
    ),
  };
}
it('requires a claimed configured reward, captures immutable grants and deduplicates request replays', async () => {
  const { season, delivery } = await setup();
  expect(await requestDelivery(season.id, 'member', 'wayfarer', 'Another attempt.', 'other-admin')).toEqual(delivery);
  await expect(requestDelivery(season.id, 'unearned', 'wayfarer', 'Unowned request.', 'requester')).rejects.toThrow(
    'Claim',
  );
  await expect(requestDelivery(season.id, 'member', 'first-light', 'Locked request.', 'requester')).rejects.toThrow(
    'Claim',
  );
  expect(delivery.gameReward).toEqual({ type: 'solaris', amount: '100' });
  expect(await ownDeliveryStatuses(season.id, 'member')).toEqual([{ rewardId: 'wayfarer', status: 'pending' }]);
  expect(await ownDeliveryStatuses(season.id, 'another-member')).toEqual([]);
  expect(mock.grant).not.toHaveBeenCalled();
});
it('enforces independent review, execution, and current revisions', async () => {
  const { season, delivery } = await setup();
  for (const actor of ['member', 'requester'])
    await expect(
      reviewDelivery(season.id, delivery.id, delivery.revision!, true, 'Approve.', actor),
    ).rejects.toMatchObject({ statusCode: 403 });
  await expect(executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toThrow('approval');
  const reviewed = await reviewDelivery(season.id, delivery.id, delivery.revision!, true, 'Approve.', 'reviewer');
  await expect(executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toThrow('changed');
  await expect(executeDelivery(season.id, delivery.id, reviewed.revision!, 'requester')).rejects.toMatchObject({
    statusCode: 403,
  });
  expect(mock.grant).not.toHaveBeenCalled();
});
it.each([false, true])('sends exactly once under concurrent execution and refuses replay (item=%s)', async (item) => {
  const { season, delivery } = await approved(item);
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')),
  );
  expect(results.filter((v) => v.status === 'fulfilled')).toHaveLength(1);
  expect(mock.grant).toHaveBeenCalledTimes(1);
  expect(mock.grant).toHaveBeenCalledWith('42', delivery.gameReward, item ? undefined : 1100n);
  const result = (await deliveryRecords(season.id)).value[0];
  expect(result.status).toBe('delivered');
  await expect(executeDelivery(season.id, delivery.id, result.revision!, 'reviewer')).rejects.toThrow('approval');
});
it('fails closed when disabled, offline status is unknown, or the original character link changes', async () => {
  const { season, delivery } = await approved();
  mock.enabled = false;
  await expect(executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toMatchObject({
    statusCode: 403,
  });
  mock.enabled = true;
  for (const onlineStatus of ['Online', null, undefined, '']) {
    mock.linked.mockResolvedValue({ linked: true, pawnId: '42', controllerId: '43', onlineStatus });
    await expect(executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toThrow('offline');
  }
  mock.linked.mockResolvedValue({ linked: true, pawnId: '99', controllerId: '43', onlineStatus: 'Offline' });
  await expect(executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toThrow('changed');
  expect(mock.grant).not.toHaveBeenCalled();
  expect((await deliveryRecords(season.id)).value[0].status).toBe('approved');
});
it('allows retry after a preflight read failure without consuming the send marker', async () => {
  const { season, delivery } = await approved();
  mock.balance.mockRejectedValueOnce(new Error('Read failed'));
  await expect(executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toThrow('Read failed');
  expect(mock.grant).not.toHaveBeenCalled();
  expect((await executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).status).toBe('delivered');
});
it.each([true, false])(
  'never resends uncertain outcomes and reconciles without another game call (applied=%s)',
  async (applied) => {
    const { season, delivery } = await approved();
    mock.grant.mockResolvedValue('uncertain');
    const parked = await executeDelivery(season.id, delivery.id, delivery.revision!, 'reviewer');
    expect(parked.status).toBe('needs_reconciliation');
    await expect(executeDelivery(season.id, parked.id, parked.revision!, 'reviewer')).rejects.toThrow('approval');
    const result = await resolveDelivery(
      season.id,
      parked.id,
      parked.revision!,
      applied,
      'Console audit confirms the actual outcome.',
      'reviewer',
    );
    expect(result.status).toBe(applied ? 'delivered' : 'cancelled');
    expect(mock.grant).toHaveBeenCalledTimes(1);
    await expect(executeDelivery(season.id, result.id, result.revision!, 'reviewer')).rejects.toThrow('approval');
  },
);
it('recovers restart-interrupted sends to reconciliation, never to another send', async () => {
  const { season, delivery } = await approved();
  const queue = await deliveryRecords(season.id);
  queue.value[0] = { ...delivery, status: 'sending', attemptedAt: new Date().toISOString() };
  await commit({
    id: season.id,
    actor: 'fixture',
    action: 'test.interrupted',
    writes: [{ key: seasonKeys.deliveries(season.id), before: queue.raw, after: queue.value }],
  });
  await expect(recoverDelivery(season.id, delivery.id, delivery.revision!, 'reviewer')).rejects.toThrow('two minutes');
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 121000);
  const recovered = await recoverDelivery(season.id, delivery.id, delivery.revision!, 'reviewer');
  expect(recovered.status).toBe('needs_reconciliation');
  expect(mock.grant).not.toHaveBeenCalled();
  vi.useRealTimers();
});
it('never executes legacy unstructured approved proposals', async () => {
  const { season } = await setup();
  const queue = await deliveryRecords(season.id);
  queue.value[0] = { ...queue.value[0], gameReward: undefined, status: 'approved', reviewedBy: 'reviewer' };
  await commit({
    id: season.id,
    actor: 'fixture',
    action: 'test.legacy',
    writes: [{ key: seasonKeys.deliveries(season.id), before: queue.raw, after: queue.value }],
  });
  await expect(executeDelivery(season.id, queue.value[0].id, queue.value[0].revision!, 'reviewer')).rejects.toThrow(
    'Legacy',
  );
  expect(mock.grant).not.toHaveBeenCalled();
});
