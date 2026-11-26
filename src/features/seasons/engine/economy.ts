import type { GameReward } from '../contracts';

/**
 * Conservative, explainable reward economy. The Console catalog exposes no prices or rarity, so values here are
 * administrator-reviewed relative points per category tier, never market prices. Changing a constant changes the
 * algorithm version for future seasons only; published seasons are immutable.
 */
export const ECONOMY_ALGORITHM = 1;
export type CatalogItem = {
  id: string;
  name: string;
  category: string;
  source?: string;
  stackSize?: number;
  entitlementControlled?: boolean;
  requiredDlc?: string;
};
export type ItemTier = 1 | 2 | 3 | 4;
export const POLICY = {
  /** Relative value points available to a player who claims all 100 rewards. */
  totalPoints: 6000,
  solarisPerPoint: 50,
  houseCreditsPerPoint: 10,
  maxSolaris: 100000,
  maxHouseCredits: 3000,
  maxTier4Items: 6,
  unitPoints: { 1: 0.1, 2: 1, 3: 4, 4: 40 } as Record<ItemTier, number>,
  maxQuantity: { 1: 200, 2: 20, 3: 10, 4: 1 } as Record<ItemTier, number>,
  step: { 1: 10, 2: 1, 3: 1, 4: 1 } as Record<ItemTier, number>,
  /** Higher-value gear never appears before the player has progressed through the pass. */
  minLevel: { 1: 1, 2: 1, 3: 11, 4: 26 } as Record<ItemTier, number>,
  tolerance: 1.08,
};
const DENIED_ID =
  /developer|debug|cheat|placeholder|^mtx_|patent|schematic|blueprint|unlock|(^|_)test(_|$)|quest|keycard|^key_|_key$|^npc|^gm_/i;
const DENIED_CATEGORY = /quest|mission|key|customiz|cosmetic|building|buildset|developer|debug|dlc|unobtain|npc/i;
const TIERS: ReadonlyArray<[ItemTier, RegExp]> = [
  [4, /weapon|armor|armour|wearable|garment|stillsuit|equipment|vehicle/],
  [3, /refined|component|tool|utility|ingredient/],
  [2, /consum|food|drink|water|medic|ammo|fuel|stimulant/],
  [1, /resource|material|raw|ore|plant|fiber|fibre|salvage/],
];
export type EligibleItem = CatalogItem & { tier: ItemTier };
export function classifyItem(item: CatalogItem): { tier: ItemTier } | { denied: string } {
  if (!/^[A-Za-z0-9_]{1,120}$/.test(item.id)) return { denied: 'unsupported identifier' };
  if (item.entitlementControlled || item.requiredDlc) return { denied: 'entitlement-controlled' };
  if (DENIED_ID.test(item.id)) return { denied: 'developer, quest or unlock item' };
  const text = `${item.category} ${item.source ?? ''}`.toLowerCase();
  if (DENIED_CATEGORY.test(text)) return { denied: 'unsupported category' };
  for (const [tier, pattern] of TIERS) if (pattern.test(text)) return { tier };
  return { denied: 'unclassified category' };
}
/** Deterministic: sorted by id so the same catalog always yields the same pool. */
export function eligibleItems(catalog: ReadonlyArray<CatalogItem>) {
  const items: EligibleItem[] = [];
  const denied: Record<string, number> = {};
  const seen = new Set<string>();
  for (const item of [...catalog].sort((a, b) => a.id.localeCompare(b.id))) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const result = classifyItem(item);
    if ('tier' in result) items.push({ ...item, tier: result.tier });
    else denied[result.denied] = (denied[result.denied] ?? 0) + 1;
  }
  return { items, denied };
}
export function pointsOf(reward: GameReward, tiers: ReadonlyMap<string, ItemTier>) {
  if (reward.type === 'solaris') return Number(reward.amount) / POLICY.solarisPerPoint;
  if (reward.type === 'house-credits') return Number(reward.amount) / POLICY.houseCreditsPerPoint;
  const tier = tiers.get(reward.itemId);
  return tier ? reward.quantity * POLICY.unitPoints[tier] : Number.POSITIVE_INFINITY;
}
const MILESTONES: Record<number, number> = { 10: 3, 25: 3, 50: 4, 75: 4, 100: 60 };
function bandWeight(level: number) {
  if (level <= 10) return 1;
  if (level <= 25) return 1.4;
  if (level <= 40) return 2;
  if (level <= 50) return 2.6;
  if (level <= 65) return 3;
  if (level <= 75) return 3.6;
  if (level <= 90) return 4.2;
  return 5;
}
/** Per-level value budget; milestones 10/25/50/75/100 are deliberately larger. Sums to the season total. */
export function levelBudgets() {
  const weights = Array.from({ length: 100 }, (_, i) => bandWeight(i + 1) * (MILESTONES[i + 1] ?? 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (POLICY.totalPoints * w) / sum);
}
export type LevelPlan = { level: number; components: GameReward[] };
/** Re-validates a plan from its own contents; used before publication and by simulations. */
export function validateEconomy(plan: ReadonlyArray<LevelPlan>, items: ReadonlyArray<EligibleItem>) {
  const problems: string[] = [];
  const tiers = new Map(items.map((i) => [i.id, i.tier]));
  const budgets = levelBudgets();
  let total = 0,
    solaris = 0,
    credits = 0,
    top = 0;
  for (const level of plan) {
    if (!level.components.length) problems.push(`Level ${level.level} has no reward.`);
    let points = 0;
    for (const part of level.components) {
      if (part.type === 'solaris') solaris += Number(part.amount);
      if (part.type === 'house-credits') credits += Number(part.amount);
      if (part.type === 'item') {
        const tier = tiers.get(part.itemId);
        if (!tier) problems.push(`Level ${level.level}: ${part.itemId} is not an eligible catalog item.`);
        else {
          if (level.level < POLICY.minLevel[tier])
            problems.push(`Level ${level.level}: ${part.itemId} is too valuable this early.`);
          if (part.quantity > POLICY.maxQuantity[tier])
            problems.push(`Level ${level.level}: quantity of ${part.itemId} exceeds the policy limit.`);
          if (tier === 4) top += part.quantity;
        }
      }
      points += pointsOf(part, tiers);
    }
    total += points;
    const budget = budgets[level.level - 1] ?? 0;
    if (points > budget * POLICY.tolerance + 1) problems.push(`Level ${level.level} exceeds its value budget.`);
    if ([10, 25, 50, 75, 100].includes(level.level) && level.components.length < 2)
      problems.push(`Milestone level ${level.level} must be a multi-reward bundle.`);
  }
  if (plan.length !== 100) problems.push('A season needs a reward at each of 100 levels.');
  if (total > POLICY.totalPoints * POLICY.tolerance) problems.push('The season exceeds its total value budget.');
  if (solaris > POLICY.maxSolaris) problems.push('The season exceeds its Solaris cap.');
  if (credits > POLICY.maxHouseCredits) problems.push('The season exceeds its House Credits cap.');
  if (top > POLICY.maxTier4Items) problems.push('The season distributes too much high-value equipment.');
  return problems;
}
