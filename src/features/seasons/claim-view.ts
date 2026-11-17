import { levelProgress, rewardComponents, type Definition, type Reward } from './contracts';

export type ClaimView = 'locked' | 'available' | 'claiming' | 'claimed' | 'pending' | 'uncertain' | 'unavailable';
export const CLAIM_STATE_LABELS: Record<ClaimView, string> = {
  locked: 'Locked',
  available: 'Claim Reward',
  claiming: 'Claiming',
  claimed: 'Claimed',
  pending: 'Pending Delivery — Retry Claim',
  uncertain: 'Delivery Uncertain — an administrator must verify it',
  unavailable: 'Unavailable',
};
/** Browser-safe mirror of the server derivation, fed only by the component statuses the API exposes. */
export function claimStateOf(
  definition: Definition,
  xp: number,
  reward: Reward,
  claims: Record<string, { status: string }[]> | undefined,
): ClaimView {
  if (levelProgress(definition, xp).level < reward.level) return 'locked';
  if (!rewardComponents(reward).length) return 'claimed';
  const parts = claims?.[reward.id];
  if (!parts) return 'available';
  const statuses = parts.map((p) => p.status);
  if (statuses.includes('uncertain')) return 'uncertain';
  if (statuses.includes('sending')) return 'claiming';
  if (statuses.every((s) => s === 'delivered')) return 'claimed';
  if (statuses.every((s) => s === 'delivered' || s === 'cancelled')) return 'unavailable';
  return 'pending';
}
export function claimSummary(
  definition: Definition,
  xp: number,
  claims: Record<string, { status: string }[]> | undefined,
) {
  const states = definition.rewards.map((r) => claimStateOf(definition, xp, r, claims));
  return {
    available: states.filter((s) => s === 'available' || s === 'pending').length,
    uncertain: states.filter((s) => s === 'uncertain').length,
    claimed: states.filter((s) => s === 'claimed').length,
  };
}
