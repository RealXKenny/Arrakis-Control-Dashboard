import { describe, expect, it } from 'vitest';
import {
  BASKET_LIMIT,
  bucketTrades,
  classifyParty,
  compareBudget,
  compareMaterial,
  decideAlert,
  emptyPlanner,
  estimatePurchase,
  parsePlannerPrefill,
  plannerHref,
  plannerSchema,
  priceSegments,
  summarizeLadder,
  summarizeSales,
  type Order,
  type Trade,
  type Watch,
} from '../../../src/features/market/planner';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const watch = (overrides: Partial<Watch> = {}): Watch => ({
  id: id(1),
  templateId: 'SpiceMelange',
  name: 'Spice melange',
  grade: null,
  below: '100',
  above: null,
  cooldownMinutes: 60,
  ...overrides,
});
const orders: Order[] = [
  { price: '9007199254740993', stock: '2', party: 'player' },
  { price: '10', stock: '3', party: 'broker' },
  { price: '12', stock: '5', party: 'player' },
  { price: '11', stock: '1', party: 'unclassified' },
];

describe('market planner schema (N041, N045, N046, N049)', () => {
  it('accepts grade-specific watches and keeps prices as decimal strings', () => {
    const planner = { ...emptyPlanner(), watches: [watch({ grade: 3, below: '9007199254740993' })] };
    expect(plannerSchema.parse(planner).watches[0]).toMatchObject({ grade: 3, below: '9007199254740993' });
  });
  it('rejects duplicate item/grade pairs, inverted thresholds and unknown fields', () => {
    const duplicate = { ...emptyPlanner(), watches: [watch(), watch({ id: id(2), templateId: 'spicemelange' })] };
    expect(plannerSchema.safeParse(duplicate).success).toBe(false);
    expect(
      plannerSchema.safeParse({ ...emptyPlanner(), watches: [watch({ id: id(2), grade: 2 }), watch()] }).success,
    ).toBe(true);
    expect(plannerSchema.safeParse({ ...emptyPlanner(), watches: [watch({ below: '50', above: '50' })] }).success).toBe(
      false,
    );
    expect(plannerSchema.safeParse({ ...emptyPlanner(), ownerId: 'foreign' }).success).toBe(false);
    expect(plannerSchema.safeParse({ ...emptyPlanner(), watches: [{ ...watch(), cooldownMinutes: 1 }] }).success).toBe(
      false,
    );
  });
  it('bounds lists, quantities, template IDs and saved filter enums', () => {
    const line = (n: number) => ({ templateId: `Item${n}`, name: 'Item', grade: null, quantity: '1' });
    expect(
      plannerSchema.safeParse({
        ...emptyPlanner(),
        basket: Array.from({ length: BASKET_LIMIT + 1 }, (_, n) => line(n)),
      }).success,
    ).toBe(false);
    expect(plannerSchema.safeParse({ ...emptyPlanner(), basket: [{ ...line(1), quantity: '0' }] }).success).toBe(false);
    expect(plannerSchema.safeParse({ ...emptyPlanner(), basket: [{ ...line(1), quantity: '1.5' }] }).success).toBe(
      false,
    );
    expect(
      plannerSchema.safeParse({ ...emptyPlanner(), basket: [{ ...line(1), templateId: '<script>' }] }).success,
    ).toBe(false);
    const filter = { id: id(3), label: 'Fuel', q: 'fuel', sort: 'price', owner: 'all' };
    expect(plannerSchema.safeParse({ ...emptyPlanner(), filters: [filter] }).success).toBe(true);
    expect(plannerSchema.safeParse({ ...emptyPlanner(), filters: [{ ...filter, owner: 'everyone' }] }).success).toBe(
      false,
    );
    const project = { id: id(4), name: 'Base', materials: [{ templateId: 'A', name: 'A', quantity: '1' }] };
    expect(plannerSchema.safeParse({ ...emptyPlanner(), projects: [project] }).success).toBe(true);
    expect(
      plannerSchema.safeParse({
        ...emptyPlanner(),
        projects: [{ ...project, materials: [...project.materials, { templateId: 'a', name: 'A', quantity: '2' }] }],
      }).success,
    ).toBe(false);
  });
});

describe('ladder summaries and purchase estimates (N045, N050)', () => {
  it('classifies only supported listing types and counts the rest as unclassified', () => {
    expect([classifyParty('player'), classifyParty('bot'), classifyParty('NPC'), classifyParty('guild')]).toEqual([
      'player',
      'broker',
      'broker',
      'unclassified',
    ]);
    expect(classifyParty(undefined)).toBe('unclassified');
  });
  it('compares player and broker asks exactly', () => {
    const summary = summarizeLadder(orders);
    expect(summary).toMatchObject({ orders: 4, lowest: '10', stock: '11', unclassified: 1 });
    expect(summary.player).toEqual({ orders: 2, lowest: '12', stock: '7' });
    expect(summary.broker).toEqual({ orders: 1, lowest: '10', stock: '3' });
    expect(summarizeLadder([])).toMatchObject({ lowest: null, stock: '0' });
  });
  it('fills cheapest first with BigInt precision and reports shortfalls', () => {
    expect(estimatePurchase(orders, '4')).toEqual({ quantity: '4', cost: '41', filled: '4', shortfall: '0' });
    expect(estimatePurchase(orders, '13')).toEqual({
      quantity: '13',
      cost: String(30n + 11n + 60n + 2n * 9007199254740993n),
      filled: '11',
      shortfall: '2',
    });
  });
});

describe('price alerts (N042)', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  it('notifies a crossing once and stays quiet during the cooldown', () => {
    const first = decideAlert(watch(), '90', null, now);
    expect(first).toMatchObject({ condition: 'below', notify: true });
    const again = decideAlert(watch(), '80', { condition: 'below', notifiedAt: first.notifiedAt }, now + 30 * 60_000);
    expect(again).toMatchObject({ notify: false, notifiedAt: first.notifiedAt });
    expect(
      decideAlert(watch(), '80', { condition: 'below', notifiedAt: first.notifiedAt }, now + 61 * 60_000).notify,
    ).toBe(true);
  });
  it('treats thresholds inclusively and handles high thresholds', () => {
    expect(decideAlert(watch(), '100', null, now).condition).toBe('below');
    expect(decideAlert(watch({ below: null, above: '500' }), '500', null, now)).toMatchObject({
      condition: 'above',
      notify: true,
    });
    expect(decideAlert(watch(), '101', null, now)).toMatchObject({ condition: 'within', notify: false });
  });
  it('never notifies on unknown readings and keeps the cooldown', () => {
    const notifiedAt = new Date(now - 1000).toISOString();
    expect(decideAlert(watch(), null, { condition: 'below', notifiedAt }, now)).toEqual({
      condition: 'unknown',
      notify: false,
      notifiedAt,
    });
  });
});

describe('budget and project comparisons (N046, N048)', () => {
  const full = estimatePurchase(orders, '4');
  it('compares a complete estimate with the read-only balance and personal budget', () => {
    expect(compareBudget([full], '41', '40')).toMatchObject({
      estimate: '41',
      estimateComplete: true,
      balanceStatus: 'within',
      budgetStatus: 'over',
      balanceShortfall: null,
    });
    expect(compareBudget([full], '40', null)).toMatchObject({ balanceStatus: 'over', balanceShortfall: '1' });
  });
  it('never claims affordability from a lower-bound estimate or a missing balance', () => {
    expect(compareBudget([full, null], '1000', '1000')).toMatchObject({
      estimateComplete: false,
      balanceStatus: 'unknown',
      budgetStatus: 'unknown',
    });
    expect(compareBudget([estimatePurchase(orders, '20')], '9999999999999999999999', null).balanceStatus).toBe(
      'unknown',
    );
    expect(compareBudget([full], null, undefined)).toMatchObject({ balanceStatus: 'unknown', budgetStatus: 'unset' });
  });
  it('subtracts owned quantities and keeps partial coverage as a bound', () => {
    const material = { templateId: 'Plastanium', name: 'Plastanium', quantity: '200' };
    expect(compareMaterial(material, { quantity: '150', complete: true })).toMatchObject({
      owned: '150',
      ownedComplete: true,
      toBuy: '50',
    });
    expect(compareMaterial(material, { quantity: '500', complete: true }).toBuy).toBe('0');
    expect(compareMaterial(material, { quantity: '0', complete: false })).toMatchObject({
      ownedComplete: false,
      toBuy: '200',
    });
    expect(compareMaterial(material, null)).toMatchObject({ owned: '0', ownedComplete: false });
  });
});

describe('observed prices and completed orders (N043, N044, N047)', () => {
  it('splits observed series at gaps and missing prices instead of interpolating', () => {
    const point = (at: string, lowest: string | null) => ({ at, lowest, stock: '1', orders: 1 });
    const segments = priceSegments(
      [
        point('2026-11-26T00:00:00Z', '10'),
        point('2026-11-26T00:10:00Z', '11'),
        point('2026-11-26T09:00:00Z', '12'),
        point('2026-11-26T09:10:00Z', null),
        point('2026-11-26T09:20:00Z', '13'),
      ],
      3_600_000,
    );
    expect(segments.map((segment) => segment.map((entry) => entry.lowest))).toEqual([['10', '11'], ['12'], ['13']]);
  });
  const trade = (at: string, overrides: Partial<Trade> = {}): Trade => ({
    at,
    templateId: 'Water',
    name: 'Water',
    units: '2',
    value: '9007199254740993',
    sellerId: null,
    ...overrides,
  });
  it('buckets completed orders hourly or daily and flags incomplete totals', () => {
    const now = Date.parse('2026-11-26T12:30:00Z');
    const buckets = bucketTrades(
      [
        trade('2026-11-26T12:05:00Z'),
        trade('2026-11-26T12:10:00Z', { units: null }),
        trade('2026-11-24T12:10:00Z'),
        trade('not a date'),
      ],
      24,
      now,
    );
    expect(buckets).toHaveLength(24);
    expect(buckets.at(-1)).toMatchObject({ trades: 2, units: '2', value: '18014398509481986', incomplete: 1 });
    expect(buckets.reduce((sum, bucket) => sum + bucket.trades, 0)).toBe(2);
    expect(bucketTrades([trade('2026-11-24T12:10:00Z')], 168, now)).toHaveLength(7);
  });
  it('attributes sales only by explicit seller ID and strips the ID from output', () => {
    const summary = summarizeSales(
      [
        trade('2026-11-26T10:00:00Z', { sellerId: '101' }),
        trade('2026-11-26T11:00:00Z', { sellerId: '202', units: '5', value: '50' }),
        trade('2026-11-26T11:30:00Z', { sellerId: '999' }),
        trade('2026-11-26T11:40:00Z', { sellerId: null, name: 'Desert Navigator' }),
      ],
      new Set(['101', '202']),
    );
    expect(summary).toMatchObject({ sales: 2, units: '7', value: '9007199254741043', incomplete: 0 });
    expect(summary.recent[0]!.at).toBe('2026-11-26T11:00:00Z');
    expect(JSON.stringify(summary)).not.toContain('sellerId');
    expect(JSON.stringify(summary)).not.toContain('999');
  });
});

describe('market tile prefill', () => {
  it('round-trips safe values and drops hostile ones', () => {
    const href = plannerHref({ templateId: 'Spice_1', name: 'Spice <b>', grade: 2 });
    const params = Object.fromEntries(new URL(href, 'http://localhost').searchParams);
    expect(parsePlannerPrefill(params)).toEqual({ templateId: 'Spice_1', name: 'Spice <b>', grade: 2 });
    expect(parsePlannerPrefill({ templateId: 'a b', name: 'x' })).toBeNull();
    expect(parsePlannerPrefill({ templateId: 'Water', grade: '999' })).toEqual({
      templateId: 'Water',
      name: 'Water',
      grade: null,
    });
  });
});
