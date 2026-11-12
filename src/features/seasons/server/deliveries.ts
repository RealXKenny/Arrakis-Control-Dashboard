import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getServerEnv } from '../../../config/env';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { identifier, gameRewardSchema, type Delivery } from '../contracts';
import { commit, fail, loadMember, readRecord, seasonKeys } from './store';
import { deliveryAvailable, deliveryGateway, offline } from './delivery-gateway';

const schema = z
  .array(
    z.object({
      id: z.string().uuid(),
      owner: identifier,
      description: z.string().max(1000),
      requestedBy: identifier,
      requestedAt: z.iso.datetime(),
      status: z.enum(['pending', 'approved', 'rejected', 'sending', 'delivered', 'needs_reconciliation', 'cancelled']),
      reviewedBy: identifier.optional(),
      reviewedAt: z.iso.datetime().optional(),
      note: z.string().max(1000).optional(),
      revision: z.string().uuid().optional(),
      rewardId: identifier.optional(),
      gameReward: gameRewardSchema.optional(),
      pawnId: identifier.optional(),
      controllerId: identifier.optional(),
      attemptedAt: z.iso.datetime().optional(),
      executedBy: identifier.optional(),
      completedAt: z.iso.datetime().optional(),
      outcome: z.string().max(120).optional(),
      resolvedBy: identifier.optional(),
      resolutionNote: z.string().max(1000).optional(),
    }),
  )
  .max(100);
export async function deliveryRecords(id: string) {
  const record = await readRecord<Delivery[]>(seasonKeys.deliveries(id));
  const value = schema.parse(record.value ?? []);
  return { raw: record.raw, value };
}
export async function ownDeliveryStatuses(id: string, owner: string) {
  return (await deliveryRecords(id)).value
    .filter((v) => v.owner === owner && v.rewardId)
    .map((v) => ({ rewardId: v.rewardId!, status: v.status }));
}
async function linked(owner: string) {
  const player = await getLinkedPlayer(
    {
      guildId: getServerEnv().DISCORD_GUILD_ID,
      channelId: 'dashboard',
      userId: owner,
      username: owner,
      roleIds: [],
      interactionId: `season-delivery-${randomUUID()}`,
      commandName: 'portal',
    },
    { timeout: 4000 },
  );
  if (
    !player.linked ||
    !player.pawnId ||
    !player.controllerId ||
    !identifier.safeParse(String(player.pawnId)).success ||
    !identifier.safeParse(String(player.controllerId)).success
  )
    fail('The recipient needs a verified linked character.', 409);
  return { pawnId: String(player.pawnId), controllerId: String(player.controllerId), status: player.onlineStatus };
}
export async function requestDelivery(id: string, owner: string, rewardId: string, description: string, actor: string) {
  const member = await loadMember(id, owner);
  const claim = member.progress.value.claims.find((v) => v.reward.id === rewardId);
  if (!claim?.reward.gameReward) fail('Claim a published reward with an in-game grant before requesting delivery.');
  const queue = await deliveryRecords(id);
  const existing = queue.value.find((v) => v.owner === owner && v.rewardId === rewardId);
  if (existing) return existing;
  if (queue.value.length >= 100) fail('This season has reached its 100-delivery limit.');
  const target = await linked(owner);
  const delivery: Delivery = {
    id: randomUUID(),
    revision: randomUUID(),
    owner,
    rewardId,
    description,
    gameReward: gameRewardSchema.parse(claim.reward.gameReward),
    pawnId: target.pawnId,
    controllerId: target.controllerId,
    requestedBy: actor,
    requestedAt: new Date().toISOString(),
    status: 'pending',
  };
  await commit({
    id,
    actor,
    action: 'delivery.requested',
    writes: [
      { key: seasonKeys.progress(id, owner), before: member.progress.raw },
      { key: seasonKeys.season(id), before: member.season.raw },
      { key: seasonKeys.deliveries(id), before: queue.raw, after: [...queue.value, delivery] },
    ],
    detail: { deliveryId: delivery.id, rewardId, owner },
  });
  return delivery;
}
async function change(
  id: string,
  deliveryId: string,
  revision: string,
  actor: string,
  action: string,
  update: (value: Delivery) => void,
) {
  const queue = await deliveryRecords(id);
  const value = queue.value.find((v) => v.id === deliveryId);
  if (!value) fail('Delivery not found.', 404);
  if ((value.revision ?? '') !== revision) fail('Delivery changed. Refresh before continuing.');
  update(value);
  value.revision = randomUUID();
  await commit({
    id,
    actor,
    action,
    writes: [{ key: seasonKeys.deliveries(id), before: queue.raw, after: queue.value }],
    detail: { deliveryId, status: value.status },
  });
  return value;
}
export async function reviewDelivery(
  id: string,
  deliveryId: string,
  revision: string,
  approve: boolean,
  note: string,
  actor: string,
) {
  return change(id, deliveryId, revision, actor, 'delivery.reviewed', (value) => {
    if (value.status !== 'pending') fail('Only pending deliveries can be reviewed.');
    if (value.requestedBy === actor || value.owner === actor)
      fail('A different administrator must review this delivery.', 403);
    value.status = approve ? 'approved' : 'rejected';
    value.reviewedBy = actor;
    value.reviewedAt = new Date().toISOString();
    value.note = note;
  });
}
export async function executeDelivery(id: string, deliveryId: string, revision: string, actor: string) {
  if (!deliveryAvailable()) fail('Season game delivery is disabled or not configured.', 403);
  const queue = await deliveryRecords(id);
  const delivery = queue.value.find((v) => v.id === deliveryId);
  if (!delivery || delivery.revision !== revision) fail('Delivery changed. Refresh before continuing.');
  if (
    delivery.status !== 'approved' ||
    !delivery.reviewedBy ||
    delivery.reviewedBy === delivery.requestedBy ||
    !delivery.gameReward ||
    !delivery.pawnId ||
    !delivery.controllerId ||
    !delivery.rewardId
  )
    fail('A structured reward and independent approval are required. Legacy proposals cannot execute.');
  if (actor === delivery.requestedBy || actor === delivery.owner)
    fail('A different administrator must execute this delivery.', 403);
  const member = await loadMember(id, delivery.owner);
  const claim = member.progress.value.claims.find((v) => v.reward.id === delivery.rewardId);
  if (!claim?.reward.gameReward || JSON.stringify(claim.reward.gameReward) !== JSON.stringify(delivery.gameReward))
    fail('The original reward ownership could not be verified.');
  let expected: bigint | undefined;
  if (delivery.gameReward.type === 'solaris')
    expected = (await deliveryGateway.balance(delivery.pawnId)) + BigInt(delivery.gameReward.amount);
  const target = await linked(delivery.owner);
  if (target.pawnId !== delivery.pawnId || target.controllerId !== delivery.controllerId)
    fail('The linked character changed. Do not redirect an approved grant.');
  if (!offline(target.status)) fail('The recipient must be offline before delivery. Nothing was sent.');
  const sending = await change(id, deliveryId, revision, actor, 'delivery.sending', (value) => {
    if (value.status !== 'approved') fail('Delivery is no longer approved.');
    value.status = 'sending';
    value.executedBy = actor;
    value.attemptedAt = new Date().toISOString();
  });
  // A persisted send marker is never automatically retried, even after a crash or a lost Redis reply.
  const outcome = await deliveryGateway.grant(delivery.pawnId, delivery.gameReward, expected);
  return change(id, deliveryId, sending.revision!, actor, 'delivery.result', (value) => {
    if (value.status !== 'sending') fail('Delivery was recovered; reconcile its outcome manually.');
    value.status = outcome === 'delivered' ? 'delivered' : 'needs_reconciliation';
    value.outcome = outcome === 'delivered' ? 'console_confirmed' : 'outcome_unknown';
    if (outcome === 'delivered') value.completedAt = new Date().toISOString();
  });
}
export async function recoverDelivery(id: string, deliveryId: string, revision: string, actor: string) {
  return change(id, deliveryId, revision, actor, 'delivery.recovered', (value) => {
    if (value.status !== 'sending' || !value.attemptedAt || Date.now() - Date.parse(value.attemptedAt) < 120000)
      fail('Only sends older than two minutes can be recovered.');
    value.status = 'needs_reconciliation';
    value.outcome = 'interrupted_send';
  });
}
export async function resolveDelivery(
  id: string,
  deliveryId: string,
  revision: string,
  applied: boolean,
  note: string,
  actor: string,
) {
  return change(id, deliveryId, revision, actor, 'delivery.reconciled', (value) => {
    if (value.status !== 'needs_reconciliation') fail('This delivery does not require reconciliation.');
    if (actor === value.requestedBy || actor === value.owner)
      fail('A different administrator must reconcile this delivery.', 403);
    value.status = applied ? 'delivered' : 'cancelled';
    value.resolvedBy = actor;
    value.resolutionNote = note;
    value.completedAt = new Date().toISOString();
    value.outcome = applied ? 'operator_verified_applied' : 'operator_verified_not_applied';
    // No rearming: the provider has no idempotency guarantee, and a suspended sender could still resume.
  });
}
