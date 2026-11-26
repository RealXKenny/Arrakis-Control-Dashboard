import { z } from 'zod';
import { MARKET_OWNERS, MARKET_SORTS } from './normalize';

/**
 * Personal market planner (N041–N050). Browser-safe contracts and pure calculations only.
 * Every price, stock and balance stays a decimal string and is compared with BigInt. Nothing here moves,
 * reserves or buys anything in game: the planner only reads exchange listings and a read-only balance.
 */
export const WATCH_LIMIT = 20;
export const BASKET_LIMIT = 20;
export const PROJECT_LIMIT = 5;
export const PROJECT_MATERIAL_LIMIT = 12;
export const FILTER_LIMIT = 10;
export const SEARCH_HISTORY_LIMIT = 10;
export const PLANNER_MAX_BYTES = 16_384;
export const COOLDOWN_MINUTES = [15, 60, 240, 1440] as const;
export const ACTIVITY_HOURS = [24, 168, 720] as const;

const WHOLE = /^(0|[1-9][0-9]{0,29})$/;
const POSITIVE = /^[1-9][0-9]{0,29}$/;
export const TEMPLATE_ID = /^[\w./:-]{1,128}$/;

const templateId = z.string().trim().regex(TEMPLATE_ID);
const itemName = z.string().trim().min(1).max(120);
const grade = z.number().int().min(0).max(99).nullable();
const price = z.string().regex(WHOLE).nullable();
const quantity = z.string().regex(POSITIVE);

export const watchSchema = z
  .object({
    id: z.uuid(),
    templateId,
    name: itemName,
    grade,
    below: price,
    above: price,
    cooldownMinutes: z.union(COOLDOWN_MINUTES.map((value) => z.literal(value))),
  })
  .strict()
  .refine((watch) => watch.below === null || watch.above === null || BigInt(watch.below) < BigInt(watch.above), {
    message: 'The low threshold must be below the high threshold.',
  });

export const basketLineSchema = z.object({ templateId, name: itemName, grade, quantity }).strict();

export const materialSchema = z.object({ templateId, name: itemName, quantity }).strict();

export const projectSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    materials: z.array(materialSchema).min(1).max(PROJECT_MATERIAL_LIMIT),
  })
  .strict()
  .refine((project) => unique(project.materials.map((entry) => entry.templateId.toLowerCase())), {
    message: 'Each material may appear once per project.',
  });

export const savedFilterSchema = z
  .object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(60),
    q: z.string().trim().max(128),
    sort: z.enum(MARKET_SORTS),
    owner: z.enum(MARKET_OWNERS),
  })
  .strict();

function unique(values: string[]): boolean {
  return new Set(values).size === values.length;
}
const itemKey = (entry: { templateId: string; grade?: number | null }) =>
  `${entry.templateId.toLowerCase()}\0${entry.grade ?? '*'}`;

export const plannerSchema = z
  .object({
    watches: z.array(watchSchema).max(WATCH_LIMIT),
    basket: z.array(basketLineSchema).max(BASKET_LIMIT),
    /** Optional personal spending cap. It never reserves Solaris; it is only compared with a basket estimate. */
    budget: price,
    projects: z.array(projectSchema).max(PROJECT_LIMIT),
    filters: z.array(savedFilterSchema).max(FILTER_LIMIT),
  })
  .strict()
  .refine((value) => unique(value.watches.map((watch) => watch.id)), { message: 'Duplicate watch.' })
  .refine((value) => unique(value.watches.map(itemKey)), { message: 'Each item and grade may be watched once.' })
  .refine((value) => unique(value.basket.map(itemKey)), { message: 'Each item and grade may appear once.' })
  .refine((value) => unique(value.projects.map((project) => project.id)), { message: 'Duplicate project.' })
  .refine((value) => unique(value.filters.map((filter) => filter.id)), { message: 'Duplicate filter.' });

export const plannerRecordSchema = z.object({ revision: z.uuid().nullable(), planner: plannerSchema }).strict();

export type Watch = z.infer<typeof watchSchema>;
export type BasketLine = z.infer<typeof basketLineSchema>;
export type Project = z.infer<typeof projectSchema>;
export type SavedFilter = z.infer<typeof savedFilterSchema>;
export type Planner = z.infer<typeof plannerSchema>;
export type PlannerRecord = z.infer<typeof plannerRecordSchema>;

export const emptyPlanner = (): Planner => ({ watches: [], basket: [], budget: null, projects: [], filters: [] });

// ---------------------------------------------------------------------------------------------------------------
// Listing ladders (N042, N045, N050)

/** Supported listing classifications. Anything the Console does not label clearly stays unclassified. */
export type Party = 'player' | 'broker' | 'unclassified';
export interface Order {
  price: string;
  stock: string;
  party: Party;
}

export function classifyParty(ownerType: unknown): Party {
  if (typeof ownerType !== 'string') return 'unclassified';
  const value = ownerType.trim().toLowerCase();
  if (value === 'player') return 'player';
  if (value === 'bot' || value === 'npc' || value === 'broker') return 'broker';
  return 'unclassified';
}

const compare = (left: string, right: string) => {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
};
const minPrice = (orders: Order[]) =>
  orders.reduce<string | null>(
    (low, order) => (low === null || compare(order.price, low) < 0 ? order.price : low),
    null,
  );
const sumStock = (orders: Order[]) => orders.reduce((sum, order) => sum + BigInt(order.stock), 0n).toString();

export interface LadderSummary {
  orders: number;
  lowest: string | null;
  stock: string;
  player: { orders: number; lowest: string | null; stock: string };
  broker: { orders: number; lowest: string | null; stock: string };
  unclassified: number;
}

export function summarizeLadder(orders: Order[]): LadderSummary {
  const side = (party: Party) => {
    const selected = orders.filter((order) => order.party === party);
    return { orders: selected.length, lowest: minPrice(selected), stock: sumStock(selected) };
  };
  return {
    orders: orders.length,
    lowest: minPrice(orders),
    stock: sumStock(orders),
    player: side('player'),
    broker: side('broker'),
    unclassified: orders.filter((order) => order.party === 'unclassified').length,
  };
}

export type LadderView =
  | { status: 'ok'; summary: LadderSummary; rejected: number; truncated: boolean; readAt: string }
  | { status: 'unavailable'; message: string; readAt: string };

export interface PurchaseEstimate {
  quantity: string;
  /** Listed cost of the units that current orders can fill, cheapest first. */
  cost: string;
  filled: string;
  shortfall: string;
}

/**
 * Walks the current ladder cheapest first. This is an estimate of listed cost, not a quote: orders can sell out or
 * change before anyone buys, and the planner never places or reserves an order.
 */
export function estimatePurchase(orders: Order[], wanted: string): PurchaseEstimate {
  let remaining = BigInt(wanted);
  let cost = 0n;
  // Dev note: we shop cheapest first, like any Fremen who has ever carried water uphill.
  for (const order of [...orders].sort((a, b) => compare(a.price, b.price))) {
    if (remaining === 0n) break;
    const take = BigInt(order.stock) < remaining ? BigInt(order.stock) : remaining;
    cost += take * BigInt(order.price);
    remaining -= take;
  }
  const filled = BigInt(wanted) - remaining;
  return { quantity: wanted, cost: cost.toString(), filled: filled.toString(), shortfall: remaining.toString() };
}

// ---------------------------------------------------------------------------------------------------------------
// Price alerts (N042)

export type AlertCondition = 'below' | 'above' | 'within' | 'unknown';
export interface AlertState {
  condition: AlertCondition;
  notifiedAt?: string | null;
}
export interface AlertDecision {
  condition: AlertCondition;
  notify: boolean;
  notifiedAt: string | null;
}

export function alertCondition(watch: Pick<Watch, 'below' | 'above'>, lowest: string | null): AlertCondition {
  if (lowest === null) return 'unknown';
  if (watch.below !== null && compare(lowest, watch.below) <= 0) return 'below';
  if (watch.above !== null && compare(lowest, watch.above) >= 0) return 'above';
  return 'within';
}

/**
 * A crossing notifies once, then stays quiet for the cooldown even if the price flickers across the threshold.
 * Unknown readings never notify and never clear the cooldown.
 */
export function decideAlert(
  watch: Pick<Watch, 'below' | 'above' | 'cooldownMinutes'>,
  lowest: string | null,
  previous: AlertState | null,
  now: number,
): AlertDecision {
  const condition = alertCondition(watch, lowest);
  const notifiedAt = previous?.notifiedAt ?? null;
  if (condition !== 'below' && condition !== 'above') return { condition, notify: false, notifiedAt };
  const last = notifiedAt ? Date.parse(notifiedAt) : NaN;
  if (Number.isFinite(last) && now - last < watch.cooldownMinutes * 60_000)
    return { condition, notify: false, notifiedAt };
  return { condition, notify: true, notifiedAt: new Date(now).toISOString() };
}

// ---------------------------------------------------------------------------------------------------------------
// Budget (N048)

export type BudgetStatus = 'within' | 'over' | 'unknown';
export interface BudgetComparison {
  estimate: string;
  estimateComplete: boolean;
  balance: string | null;
  budget: string | null;
  balanceStatus: BudgetStatus;
  budgetStatus: BudgetStatus | 'unset';
  /** Positive amount the estimate exceeds the balance by, when known. */
  balanceShortfall: string | null;
}

export function compareBudget(
  estimates: (PurchaseEstimate | null)[],
  balance: string | null,
  rawBudget: string | null | undefined,
): BudgetComparison {
  const budget = rawBudget ?? null;
  const known = estimates.filter((entry): entry is PurchaseEstimate => entry !== null);
  const estimate = known.reduce((sum, entry) => sum + BigInt(entry.cost), 0n);
  // A missing ladder or unfilled units make the estimate a lower bound, so "within" cannot be claimed.
  const estimateComplete = known.length === estimates.length && known.every((entry) => entry.shortfall === '0');
  const judge = (limit: string | null): BudgetStatus => {
    if (limit === null) return 'unknown';
    if (estimate > BigInt(limit)) return 'over';
    return estimateComplete ? 'within' : 'unknown';
  };
  const shortfall = balance !== null && estimate > BigInt(balance) ? (estimate - BigInt(balance)).toString() : null;
  return {
    estimate: estimate.toString(),
    estimateComplete,
    balance,
    budget,
    balanceStatus: judge(balance),
    budgetStatus: budget === null ? 'unset' : judge(budget),
    balanceShortfall: shortfall,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Project shopping (N046)

export interface MaterialComparison {
  templateId: string;
  name: string;
  needed: string;
  owned: string;
  /** False when storage coverage was partial: `owned` is then a lower bound and `toBuy` an upper bound. */
  ownedComplete: boolean;
  toBuy: string;
  estimate: PurchaseEstimate | null;
}

export function compareMaterial(
  material: Pick<Project['materials'][number], 'templateId' | 'name' | 'quantity'>,
  owned: { quantity: string; complete: boolean } | null,
): Omit<MaterialComparison, 'estimate'> {
  const have = owned && WHOLE.test(owned.quantity) ? BigInt(owned.quantity) : 0n;
  const need = BigInt(material.quantity);
  return {
    templateId: material.templateId,
    name: material.name,
    needed: material.quantity,
    owned: have.toString(),
    ownedComplete: owned?.complete === true && WHOLE.test(owned.quantity),
    toBuy: (need > have ? need - have : 0n).toString(),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Observed price snapshots (N043)

export interface PricePoint {
  at: string;
  lowest?: string | null;
  stock: string;
  orders: number;
}

/** Splits a series where observations are further apart than `maxGapMs`, so charts never draw across gaps. */
export function priceSegments(points: PricePoint[], maxGapMs: number): PricePoint[][] {
  const segments: PricePoint[][] = [];
  let current: PricePoint[] = [];
  let previous = NaN;
  for (const point of [...points].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const at = Date.parse(point.at);
    if (!Number.isFinite(at)) continue;
    if (point.lowest === null || (Number.isFinite(previous) && at - previous > maxGapMs)) {
      if (current.length) segments.push(current);
      current = [];
    }
    if (point.lowest !== null) current.push(point);
    previous = at;
  }
  if (current.length) segments.push(current);
  return segments;
}

// ---------------------------------------------------------------------------------------------------------------
// Completed-order activity (N044) and ownership-verified sales (N047)

export interface Trade {
  at: string;
  templateId: string | null;
  name: string | null;
  units: string | null;
  value: string | null;
  /** Explicit seller identity from the Console. Never shown to members; used only for own-sale attribution. */
  sellerId: string | null;
}

export interface ActivityBucket {
  start: string;
  trades: number;
  units: string;
  value: string;
  /** Trades in this bucket whose units or value the Console did not report as whole numbers. */
  incomplete: number;
}

export function bucketTrades(trades: Trade[], hours: number, now: number): ActivityBucket[] {
  const size = hours <= 24 ? 3_600_000 : 86_400_000;
  const count = Math.ceil((hours * 3_600_000) / size);
  const end = Math.floor(now / size) * size + size;
  const start = end - count * size;
  const buckets = Array.from({ length: count }, (_, index) => ({
    start: start + index * size,
    trades: 0,
    units: 0n,
    value: 0n,
    incomplete: 0,
  }));
  for (const trade of trades) {
    const at = Date.parse(trade.at);
    if (!Number.isFinite(at) || at < start || at >= end) continue;
    const bucket = buckets[Math.floor((at - start) / size)]!;
    bucket.trades += 1;
    if (trade.units !== null) bucket.units += BigInt(trade.units);
    if (trade.value !== null) bucket.value += BigInt(trade.value);
    if (trade.units === null || trade.value === null) bucket.incomplete += 1;
  }
  return buckets.map((bucket) => ({
    start: new Date(bucket.start).toISOString(),
    trades: bucket.trades,
    units: bucket.units.toString(),
    value: bucket.value.toString(),
    incomplete: bucket.incomplete,
  }));
}

export interface SalesSummary {
  sales: number;
  units: string;
  value: string;
  incomplete: number;
  items: { templateId: string | null; name: string | null; sales: number; units: string; value: string }[];
  recent: Omit<Trade, 'sellerId'>[];
}

/** Attributes only trades whose explicit seller ID matches the freshly verified character. Names never count. */
export function summarizeSales(trades: Trade[], ownIds: Set<string>): SalesSummary {
  const own = trades
    .filter((trade) => trade.sellerId !== null && ownIds.has(trade.sellerId))
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const items = new Map<string, SalesSummary['items'][number]>();
  let units = 0n;
  let value = 0n;
  let incomplete = 0;
  for (const trade of own) {
    if (trade.units !== null) units += BigInt(trade.units);
    if (trade.value !== null) value += BigInt(trade.value);
    if (trade.units === null || trade.value === null) incomplete += 1;
    const key = trade.templateId ?? trade.name ?? 'unknown';
    const entry = items.get(key) ?? {
      templateId: trade.templateId,
      name: trade.name,
      sales: 0,
      units: '0',
      value: '0',
    };
    entry.sales += 1;
    entry.units = (BigInt(entry.units) + BigInt(trade.units ?? '0')).toString();
    entry.value = (BigInt(entry.value) + BigInt(trade.value ?? '0')).toString();
    items.set(key, entry);
  }
  return {
    sales: own.length,
    units: units.toString(),
    value: value.toString(),
    incomplete,
    items: [...items.values()].sort((a, b) => b.sales - a.sales).slice(0, 20),
    recent: own.slice(0, 20).map(({ sellerId: _sellerId, ...trade }) => trade),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Response views shared by the API and the browser

export interface PlannerReadings {
  readAt: string;
  watches: { id: string; ladder: LadderView; alert: AlertDecision }[];
  alertsSaved: boolean;
  basket: { key: string; ladder: LadderView; estimate: PurchaseEstimate | null }[];
  budget: BudgetComparison;
  balance: { status: 'ok'; readAt: string } | { status: 'unlinked' | 'unavailable' };
}
export interface CoverageView {
  fetched: number;
  excluded: number;
  reported: number | null;
  truncated: boolean;
}
export type ActivityView =
  | {
      status: 'ok';
      hours: number;
      buckets: ActivityBucket[];
      totals: { events: string | null; units: string | null; value: string | null } | null;
      coverage: CoverageView;
      readAt: string;
    }
  | { status: 'unsupported' | 'denied' | 'unavailable'; message: string; readAt: string };
export type SalesView =
  | {
      status: 'ok';
      hours: number;
      summary: SalesSummary;
      coverage: CoverageView & { unattributed: number };
      readAt: string;
    }
  | { status: 'unsupported' | 'denied' | 'unavailable' | 'unattributable'; message: string; readAt: string };
export interface ProjectComparisonView {
  project: { id: string; name: string };
  materials: MaterialComparison[];
  coverage: { sources: { name: string; status: string; detail?: string }[]; limited: boolean; startedAt: string };
}
export function ladderKeyFor(templateId: string, grade?: number | null): string {
  return `${templateId.toLowerCase()}:${grade ?? '*'}`;
}

/** Prefill from a market tile link. Hostile values are dropped rather than echoed into the form. */
export function parsePlannerPrefill(
  params: Record<string, string | string[] | undefined>,
): { templateId: string; name: string; grade: number | null } | null {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);
  const templateId = (first(params.templateId) ?? '').trim();
  if (!TEMPLATE_ID.test(templateId)) return null;
  const name = (first(params.name) ?? '').trim().slice(0, 120) || templateId;
  const gradeText = first(params.grade) ?? '';
  const grade = /^[0-9]{1,2}$/.test(gradeText) ? Number(gradeText) : null;
  return { templateId, name, grade };
}

export function plannerHref(item: { templateId: string; name: string; grade: number | null }): string {
  const params = new URLSearchParams({ templateId: item.templateId, name: item.name });
  if (item.grade !== null && item.grade !== undefined) params.set('grade', String(item.grade));
  return `/market/planner?${params}`;
}
