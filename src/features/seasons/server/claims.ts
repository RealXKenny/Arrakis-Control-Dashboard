import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getServerEnv } from '../../../config/env';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { createLogger } from '../../../lib/logger';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import {
  claimsRecordSchema,
  identifier,
  levelProgress,
  rewardComponents,
  seasonState,
  type ClaimRecord,
  type Definition,
  type Reward,
} from '../contracts';
import { currencyOf, deliveryAvailable, deliveryGateway, offline } from './delivery-gateway';
import { claimReward } from './engine';
import { commit, fail, loadMember, readRecord, seasonKeys } from './store';

const log = createLogger('SEASON CLAIMS');
/** The recipient is always the member's own verified linked character, resolved server-side. */
async function linked(owner: string) {
  const player = await getLinkedPlayer(
    {
      guildId: getServerEnv().DISCORD_GUILD_ID,
      channelId: 'dashboard',
      userId: owner,
      username: owner,
      roleIds: [],
      interactionId: `season-claim-${randomUUID()}`,
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
/** A persisted send marker older than this is treated as an interrupted send and parked, never resent. */
const STUCK_MS = 120000;
const CLAIM_ALL_BATCH = 10;
type Claims = Record<string, ClaimRecord>;
export type ClaimState = 'locked' | 'available' | 'claiming' | 'claimed' | 'pending' | 'uncertain' | 'unavailable';

export async function loadGameClaims(id: string, owner: string) {
  const record = await readRecord<unknown>(seasonKeys.gameClaims(id, owner));
  return { raw: record.raw, value: claimsRecordSchema.parse(record.value ?? {}) as Claims };
}
/** Pure presentation state for one reward, derived only from durable records. */
export function claimState(definition: Definition, xp: number, reward: Reward, record: ClaimRecord | undefined) {
  if (levelProgress(definition, xp).level < reward.level) return 'locked' as const;
  if (!rewardComponents(reward).length) return 'claimed' as const;
  if (!record) return 'available' as const;
  const statuses = record.components.map((c) => c.status);
  if (statuses.includes('uncertain')) return 'uncertain' as const;
  if (statuses.includes('sending')) return 'claiming' as const;
  if (statuses.every((s) => s === 'delivered')) return 'claimed' as const;
  if (statuses.every((s) => s === 'delivered' || s === 'cancelled')) return 'unavailable' as const;
  return 'pending' as const;
}
const write = async (
  id: string,
  owner: string,
  before: string,
  value: Claims,
  action: string,
  detail = {},
  actor = owner,
) => {
  await commit({
    id,
    actor,
    action,
    writes: [{ key: seasonKeys.gameClaims(id, owner), before, after: value }],
    detail,
  });
  return JSON.stringify(value);
};
const attentionSchema = z
  .array(z.object({ owner: identifier, rewardId: identifier, since: z.iso.datetime() }))
  .max(500);
/** Advisory index of claims that need a human; the per-owner record stays authoritative. Best effort, idempotent. */
async function markAttention(id: string, owner: string, rewardId: string, add: boolean) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const record = await readRecord<unknown>(seasonKeys.claimAttention(id));
      const list = attentionSchema.parse(record.value ?? []);
      const exists = list.some((v) => v.owner === owner && v.rewardId === rewardId);
      if (exists === add) return;
      const next = add
        ? [...list, { owner, rewardId, since: new Date().toISOString() }]
        : list.filter((v) => !(v.owner === owner && v.rewardId === rewardId));
      await commit({
        id,
        actor: owner,
        action: add ? 'claim.attention.added' : 'claim.attention.cleared',
        writes: [{ key: seasonKeys.claimAttention(id), before: record.raw, after: next }],
        detail: { owner, rewardId },
      });
      return;
    } catch {
      /* conflict: reread and retry */
    }
  }
  log.warn('Claim attention index could not be updated; the per-player record remains authoritative.');
}
export async function claimAttention(id: string) {
  const record = await readRecord<unknown>(seasonKeys.claimAttention(id));
  return attentionSchema.parse(record.value ?? []);
}
/** Turns stale send markers into uncertain records. It never sends and never clears an uncertainty. */
function parkInterrupted(claims: Claims) {
  let changed = false;
  for (const record of Object.values(claims))
    for (const part of record.components)
      if (part.status === 'sending' && part.attemptedAt && Date.now() - Date.parse(part.attemptedAt) >= STUCK_MS) {
        part.status = 'uncertain';
        part.outcome = 'interrupted_send';
        record.revision = randomUUID();
        changed = true;
      }
  return changed;
}
export type ClaimResult = { rewardId: string; state: ClaimState; message?: string };
export async function claimGameReward(id: string, owner: string, rewardId: string): Promise<ClaimResult> {
  const limit = await checkRateLimit(`v2:seasons:claim:${owner}`, { limit: 60, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    fail('Reward claiming is temporarily limited.', limit.storageUnavailable ? 503 : 429);
  const data = await loadMember(id, owner);
  const season = data.season.value;
  if (['draft', 'preview', 'scheduled'].includes(seasonState(season))) fail('This reward track has not started.');
  const reward = season.definition.rewards.find((v) => v.id === rewardId);
  if (!reward || levelProgress(season.definition, data.progress.value.xp).level < reward.level)
    fail('This reward is locked.', 403);
  const components = rewardComponents(reward);
  // The dashboard cosmetic is account-level and idempotent; it never depends on game delivery.
  await claimReward(id, owner, rewardId);
  if (!components.length) return { rewardId, state: 'claimed' };
  if (!deliveryAvailable())
    fail('In-game delivery is not configured. Your dashboard cosmetic is claimed; try again later.', 503);
  let claims = await loadGameClaims(id, owner);
  if (parkInterrupted(claims.value))
    claims = { raw: await write(id, owner, claims.raw, claims.value, 'claim.parked'), value: claims.value };
  let record = claims.value[rewardId];
  const current = claimState(season.definition, data.progress.value.xp, reward, record);
  if (current === 'claimed' || current === 'unavailable') return { rewardId, state: current };
  if (current === 'claiming')
    fail('A delivery for this reward is in progress. Refresh in a moment; nothing is resent.', 409);
  if (current === 'uncertain') {
    await markAttention(id, owner, rewardId, true);
    fail('An earlier delivery has an uncertain outcome and needs administrator verification. Nothing was resent.', 409);
  }
  const target = await linked(owner);
  if (!offline(target.status))
    fail('Log out of Dune: Awakening before claiming in-game rewards. Nothing was sent.', 409);
  const sameCharacter = (r: ClaimRecord) => r.pawnId === target.pawnId && r.controllerId === target.controllerId;
  if (Object.values(claims.value).some((r) => !sameCharacter(r)))
    fail('This season is bound to the character used for your first claim. Link that character to continue.', 409);
  let raw = claims.raw;
  if (!record) {
    record = {
      version: 1,
      rewardId,
      pawnId: target.pawnId,
      controllerId: target.controllerId,
      createdAt: new Date().toISOString(),
      revision: randomUUID(),
      components: components.map((reward) => ({ reward, status: 'pending' as const })),
    };
    claims.value[rewardId] = record;
    raw = await write(id, owner, raw, claims.value, 'claim.created', { rewardId });
  }
  for (const part of record.components) {
    if (part.status !== 'pending') continue;
    const currency = currencyOf(part.reward);
    let expected: bigint | undefined;
    if (currency) {
      // Nothing has been sent yet, so a failed balance read is safe to retry on the next click.
      try {
        expected =
          (await deliveryGateway.balance(record.pawnId, currency)) + BigInt((part.reward as { amount: string }).amount);
      } catch {
        return { rewardId, state: 'pending', message: 'The game server did not answer. Nothing was sent; try again.' };
      }
    }
    part.status = 'sending';
    part.attemptedAt = new Date().toISOString();
    record.revision = randomUUID();
    // The marker is durable before the game is contacted. A lost reply can therefore never be resent.
    raw = await write(id, owner, raw, claims.value, 'claim.sending', { rewardId });
    await markAttention(id, owner, rewardId, true);
    const outcome = await deliveryGateway.grant(record.pawnId, part.reward, expected);
    part.status = outcome === 'delivered' ? 'delivered' : 'uncertain';
    part.outcome = outcome === 'delivered' ? 'console_confirmed' : 'outcome_unknown';
    if (outcome === 'delivered') part.completedAt = new Date().toISOString();
    record.revision = randomUUID();
    raw = await write(id, owner, raw, claims.value, 'claim.result', { rewardId, outcome });
    if (outcome !== 'delivered') {
      await markAttention(id, owner, rewardId, true);
      return {
        rewardId,
        state: 'uncertain',
        message:
          'The game server did not confirm this delivery. It will not be resent until an administrator verifies it.',
      };
    }
  }
  const finalState = claimState(season.definition, data.progress.value.xp, reward, record);
  if (finalState === 'claimed' || finalState === 'unavailable') await markAttention(id, owner, rewardId, false);
  return { rewardId, state: finalState };
}
/** Claims unlocked rewards in level order, a bounded batch per request. Stops at the first uncertain or blocking result. */
export async function claimAllAvailable(id: string, owner: string) {
  const data = await loadMember(id, owner);
  const { definition } = data.season.value;
  const claims = await loadGameClaims(id, owner);
  const todo = [...definition.rewards]
    .sort((a, b) => a.level - b.level)
    .filter((r) => {
      const state = claimState(definition, data.progress.value.xp, r, claims.value[r.id]);
      const cosmeticMissing = !data.progress.value.claims.some((c) => c.reward.id === r.id);
      return state === 'available' || state === 'pending' || (state === 'claimed' && cosmeticMissing);
    });
  const results: ClaimResult[] = [];
  // Any unresolved delivery pauses all further sends: the game API may be unhealthy and nothing may be duplicated.
  const blocked = Object.values(claims.value).some((r) =>
    r.components.some((c) => c.status === 'uncertain' || c.status === 'sending'),
  );
  if (blocked)
    return {
      results,
      remaining: todo.length,
      blocked: 'An earlier delivery needs administrator verification before more rewards can be sent.',
    };
  for (const reward of todo.slice(0, CLAIM_ALL_BATCH)) {
    try {
      const result = await claimGameReward(id, owner, reward.id);
      results.push(result);
      if (result.state === 'uncertain' || result.state === 'pending') break;
    } catch (error) {
      results.push({
        rewardId: reward.id,
        state: 'pending',
        message: error instanceof Error ? error.message.slice(0, 200) : 'Claim failed.',
      });
      break;
    }
  }
  return { results, remaining: Math.max(0, todo.length - results.length), blocked: null as string | null };
}
/**
 * Worker-only. Parks interrupted sends as quarantined and clears resolved entries. It reads claim records and writes
 * only the compare-and-set claim state; it never contacts the game, so it cannot create or repeat a grant.
 */
export async function recoverClaims(id: string) {
  const result = { parked: 0, quarantined: 0, cleared: 0 };
  for (const entry of (await claimAttention(id)).slice(0, 200)) {
    const claims = await loadGameClaims(id, entry.owner);
    if (parkInterrupted(claims.value)) {
      try {
        await write(
          id,
          entry.owner,
          claims.raw,
          claims.value,
          'claim.parked',
          { rewardId: entry.rewardId },
          'system:reward-recovery',
        );
        result.parked += 1;
      } catch {
        continue; // the player or another worker changed it; reread next tick
      }
    }
    const open =
      claims.value[entry.rewardId]?.components.filter((c) => c.status === 'uncertain' || c.status === 'sending') ?? [];
    if (open.length) result.quarantined += open.length;
    else {
      await markAttention(id, entry.owner, entry.rewardId, false);
      result.cleared += 1;
    }
  }
  return result;
}
