import type { Economy, GameReward } from '../contracts';
import {
  ECONOMY_ALGORITHM,
  POLICY,
  eligibleItems,
  levelBudgets,
  pointsOf,
  validateEconomy,
  type CatalogItem,
  type EligibleItem,
  type ItemTier,
  type LevelPlan,
} from './economy';
import { seededRandom, weightedPick } from './rng';

export type RewardPlan = { levels: LevelPlan[]; economy: Omit<Economy, 'catalogHash'>; problems: string[] };
const round = (value: number, step: number) => Math.floor(value / step) * step;
/**
 * Deterministic reward generation. The same season number, theme focus and catalog always produce the same plan.
 * Without a usable catalog the plan degrades to currency-only components and says so; it never invents item IDs.
 */
export function generateRewardPlan(input: {
  seed: string;
  focus: ReadonlyArray<string>;
  catalog: ReadonlyArray<CatalogItem> | null;
}): RewardPlan {
  const notes: string[] = [];
  const pool = input.catalog ? eligibleItems(input.catalog) : { items: [] as EligibleItem[], denied: {} };
  if (!input.catalog) notes.push('Item catalog unavailable: rewards use currency and cosmetics only.');
  else if (pool.items.length < 20)
    notes.push(`Only ${pool.items.length} eligible catalog items; item variety is limited.`);
  // Without items, currency alone must stay under its caps, so the whole budget shrinks proportionally.
  const scale = pool.items.length ? 1 : (POLICY.maxSolaris / POLICY.solarisPerPoint / POLICY.totalPoints) * 0.9;
  const budgets = levelBudgets().map((b) => b * scale);
  const tiers = new Map(pool.items.map((i) => [i.id, i.tier] as const));
  const used = new Map<string, number>();
  let solaris = 0,
    credits = 0,
    top = 0;
  const levels: LevelPlan[] = budgets.map((budget, index) => {
    const level = index + 1;
    const random = seededRandom(`rewards:${input.seed}:${level}`);
    const milestone = [10, 25, 50, 75, 100].includes(level);
    const wanted = milestone ? 3 : level % 3 === 0 ? 2 : 1;
    const components: GameReward[] = [];
    let remaining = budget;
    for (let slot = 0; slot < wanted && remaining > 0.2; slot++) {
      const share = slot === wanted - 1 ? remaining : remaining * 0.6;
      const options: { item: 'solaris' | 'house' | EligibleItem; weight: number }[] = [];
      if (solaris + share * POLICY.solarisPerPoint <= POLICY.maxSolaris && share * POLICY.solarisPerPoint >= 10)
        options.push({ item: 'solaris', weight: 2 });
      if (
        level >= 11 &&
        credits + share * POLICY.houseCreditsPerPoint <= POLICY.maxHouseCredits &&
        share * POLICY.houseCreditsPerPoint >= 5
      )
        options.push({ item: 'house', weight: 0.7 });
      for (const item of pool.items) {
        const tier = item.tier;
        if (level < POLICY.minLevel[tier] || share < POLICY.unitPoints[tier] * POLICY.step[tier]) continue;
        if (tier === 4 && top >= POLICY.maxTier4Items) continue;
        if (components.some((c) => c.type === 'item' && c.itemId === item.id)) continue;
        const text = `${item.id} ${item.name}`.toLowerCase();
        const themed = input.focus.some((f) => text.includes(f)) ? 4 : 1;
        options.push({ item, weight: (themed * (tier === 4 ? 0.2 : 1)) / (1 + (used.get(item.id) ?? 0) * 2) });
      }
      const pick = weightedPick(options, random);
      if (pick === 'solaris' || pick === null) {
        const amount = Math.max(10, round(share * POLICY.solarisPerPoint, 10));
        components.push({ type: 'solaris', amount: String(amount) });
        solaris += amount;
        remaining -= amount / POLICY.solarisPerPoint;
      } else if (pick === 'house') {
        const amount = Math.max(5, round(share * POLICY.houseCreditsPerPoint, 5));
        components.push({ type: 'house-credits', amount: String(amount) });
        credits += amount;
        remaining -= amount / POLICY.houseCreditsPerPoint;
      } else {
        const tier: ItemTier = pick.tier;
        const quantity = Math.max(
          POLICY.step[tier],
          Math.min(POLICY.maxQuantity[tier], round(share / POLICY.unitPoints[tier], POLICY.step[tier])),
        );
        components.push({ type: 'item', itemId: pick.id, quantity, quality: 0 });
        used.set(pick.id, (used.get(pick.id) ?? 0) + 1);
        if (tier === 4) top += quantity;
        remaining -= quantity * POLICY.unitPoints[tier];
      }
    }
    if (!components.length) {
      components.push({ type: 'solaris', amount: '10' });
      solaris += 10;
    }
    return { level, components };
  });
  const problems = validateEconomy(levels, pool.items);
  const total = levels.reduce((s, l) => s + l.components.reduce((a, c) => a + pointsOf(c, tiers), 0), 0);
  return {
    levels,
    problems,
    economy: {
      algorithm: ECONOMY_ALGORITHM,
      catalogItems: pool.items.length,
      totalPoints: Math.round(total),
      playerBudgetPoints: Math.round(total),
      solaris,
      houseCredits: credits,
      notes: [
        ...notes,
        ...Object.entries(pool.denied).map(([reason, count]) => `Excluded ${count} item(s): ${reason}.`),
      ].slice(0, 20),
    },
  };
}
