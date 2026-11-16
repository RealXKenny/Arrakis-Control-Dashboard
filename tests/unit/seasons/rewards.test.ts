import { describe, expect, it } from 'vitest';
import {
  classifyItem,
  eligibleItems,
  levelBudgets,
  POLICY,
  validateEconomy,
  type CatalogItem,
} from '../../../src/features/seasons/engine/economy';
import { generateRewardPlan } from '../../../src/features/seasons/engine/rewards';
import { definitionSchema, gameRewardSchema, rewardComponents } from '../../../src/features/seasons/contracts';
import content from '../../../src/features/seasons/content/season-2-template.json';
import { automaticProgressTemplate, generateSeason } from '../../../src/features/seasons/generation';

const categories = ['resources', 'consumables', 'components', 'weapons', 'armor', 'tools', 'raw_materials'];
const catalog: CatalogItem[] = [
  ...Array.from({ length: 140 }, (_, i) => ({
    id: `Item_${String(i).padStart(3, '0')}`,
    name: `Test Item ${i}`,
    category: categories[i % categories.length],
    source: 'items',
  })),
  { id: 'Developer_Storage_Container', name: 'Dev box', category: 'tools' },
  { id: 'MTX_Skin', name: 'Skin', category: 'wearables', entitlementControlled: true },
  { id: 'Quest_Token', name: 'Quest', category: 'resources' },
  { id: 'Mystery', name: 'Mystery', category: 'misc' },
  { id: 'bad id', name: 'Bad', category: 'resources' },
];
describe('item eligibility', () => {
  it('excludes developer, entitlement, quest, unclassified and invalid items', () => {
    expect(classifyItem(catalog[140])).toMatchObject({ denied: expect.any(String) });
    for (const item of catalog.slice(140)) expect('denied' in classifyItem(item)).toBe(true);
    const pool = eligibleItems(catalog);
    expect(pool.items).toHaveLength(140);
    expect(Object.keys(pool.denied).length).toBeGreaterThan(1);
  });
  it('is stable regardless of catalog order', () => {
    expect(eligibleItems([...catalog].reverse()).items).toEqual(eligibleItems(catalog).items);
  });
});
describe('reward economy', () => {
  it('splits a fixed season budget with larger milestone levels', () => {
    const budgets = levelBudgets();
    expect(budgets).toHaveLength(100);
    expect(budgets.reduce((a, b) => a + b, 0)).toBeCloseTo(POLICY.totalPoints, 5);
    expect(budgets[99]).toBeGreaterThan(budgets[98] * 5);
    expect(budgets[49]).toBeGreaterThan(budgets[48]);
  });
  it('generates a valid reward at every one of 100 levels, deterministically', () => {
    const input = { seed: 'season-3', focus: ['water', 'spice'], catalog };
    const plan = generateRewardPlan(input);
    expect(plan.problems).toEqual([]);
    expect(plan.levels).toHaveLength(100);
    expect(generateRewardPlan(input)).toEqual(plan);
    expect(generateRewardPlan({ ...input, seed: 'season-4' }).levels).not.toEqual(plan.levels);
    for (const level of plan.levels) {
      expect(level.components.length).toBeGreaterThanOrEqual(1);
      for (const part of level.components) expect(gameRewardSchema.safeParse(part).success).toBe(true);
      expect(rewardComponents({ bundle: level.components })).toHaveLength(level.components.length);
    }
    for (const milestone of [10, 25, 50, 75, 100])
      expect(plan.levels[milestone - 1].components.length).toBeGreaterThanOrEqual(2);
    expect(plan.economy.solaris).toBeLessThanOrEqual(POLICY.maxSolaris);
    expect(plan.economy.houseCredits).toBeLessThanOrEqual(POLICY.maxHouseCredits);
  });
  it('only uses catalog items and keeps valuable gear out of the early levels', () => {
    const plan = generateRewardPlan({ seed: 'season-5', focus: [], catalog });
    const ids = new Set(catalog.map((i) => i.id));
    const tiers = new Map(eligibleItems(catalog).items.map((i) => [i.id, i.tier]));
    for (const level of plan.levels)
      for (const part of level.components)
        if (part.type === 'item') {
          expect(ids.has(part.itemId)).toBe(true);
          expect(level.level).toBeGreaterThanOrEqual(POLICY.minLevel[tiers.get(part.itemId)!]);
          expect(part.quality).toBe(0);
        }
  });
  it('falls back to currency only, with an explicit note, when the catalog is unavailable', () => {
    const plan = generateRewardPlan({ seed: 'season-6', focus: [], catalog: null });
    expect(plan.problems).toEqual([]);
    expect(plan.levels.every((l) => l.components.every((c) => c.type !== 'item'))).toBe(true);
    expect(plan.economy.notes.join(' ')).toContain('catalog unavailable');
  });
  it('rejects unsafe plans: unknown items, oversized quantities, empty levels and budget overruns', () => {
    const items = eligibleItems(catalog).items;
    const good = generateRewardPlan({ seed: 's', focus: [], catalog }).levels;
    const bad = structuredClone(good);
    bad[0].components = [{ type: 'item', itemId: 'Made_Up', quantity: 1, quality: 0 }];
    bad[1].components = [];
    bad[2].components = [{ type: 'solaris', amount: '999999' }];
    const problems = validateEconomy(bad, items).join(' ');
    expect(problems).toContain('not an eligible catalog item');
    expect(problems).toContain('Level 2 has no reward');
    expect(problems).toContain('exceeds its value budget');
    expect(problems).toContain('Solaris cap');
  });
});
describe('season generation with the reward economy', () => {
  const settings = { firstNumber: 1, firstStart: '2026-01-01T00:00:00.000Z', timezone: 'UTC' };
  const base = () => automaticProgressTemplate(definitionSchema.parse(content.definition));
  it('attaches a bundle to all 100 levels, records the economy audit and stays deterministic', () => {
    const items = { items: catalog, hash: 'a'.repeat(64) };
    const season = generateSeason(base(), settings, 2, 1, items);
    expect(season.rewards).toHaveLength(100);
    expect(season.rewards.every((r) => rewardComponents(r).length >= 1)).toBe(true);
    expect(season.economy?.catalogHash).toBe('a'.repeat(64));
    expect(generateSeason(base(), settings, 2, 1, items)).toEqual(season);
    expect(definitionSchema.safeParse(season).success).toBe(true);
  });
  it('keeps cosmetics-only seasons when the Console is not configured and currency-only when it has no catalog', () => {
    expect(generateSeason(base(), settings, 2, 1).economy).toBeUndefined();
    const fallback = generateSeason(base(), settings, 2, 1, null);
    expect(fallback.economy?.notes.join(' ')).toContain('catalog unavailable');
    expect(fallback.rewards.every((r) => r.bundle!.every((c) => c.type !== 'item'))).toBe(true);
  });
});
