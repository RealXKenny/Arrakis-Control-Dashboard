import { z } from 'zod';
import type { FinderResult, FoundItem } from './item-finder';

/** Browser-safe equipment planning model for N003–N010. Readings are observations, never game actions. */
export const LOADOUT_PURPOSES = ['harvesting', 'combat', 'building', 'exploration'] as const;
export type LoadoutPurpose = (typeof LOADOUT_PURPOSES)[number];
export const loadoutPurposeLabel: Record<LoadoutPurpose, string> = {
  harvesting: 'Harvesting',
  combat: 'Combat',
  building: 'Building',
  exploration: 'Exploration',
};
export const LOADOUT_LIMIT = 8;
export const LOADOUT_ITEM_LIMIT = 20;
export const WATCH_LIMIT = 24;
export const FILTER_LIMIT = 12;
export const STORAGE_RULE_LIMIT = 24;
export const COMPARE_LIMIT = 4;
export const PLANNER_MAX_BYTES = 96 * 1024;

const templateId = z.string().trim().min(1).max(128);
const itemName = z.string().trim().min(1).max(120);
const grade = z.number().int().min(0).max(10);
const percent = z.number().int().min(0).max(100);
const uniqueTemplates = <T extends { templateId: string }>(values: T[]) =>
  new Set(values.map((value) => value.templateId.toLowerCase())).size === values.length;
const uniqueIds = <T extends { id: string }>(values: T[]) =>
  new Set(values.map((value) => value.id)).size === values.length;

export const loadoutItemSchema = z
  .object({
    templateId,
    name: itemName,
    // Decimal strings keep the contract aligned with exact inventory quantities.
    quantity: z.string().regex(/^[1-9][0-9]{0,8}$/),
    minGrade: grade.nullable(),
    minDurabilityPercent: percent.nullable(),
  })
  .strict();
export const loadoutSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(80),
    purpose: z.enum(LOADOUT_PURPOSES),
    notes: z.string().max(500),
    items: z.array(loadoutItemSchema).min(1).max(LOADOUT_ITEM_LIMIT).refine(uniqueTemplates),
  })
  .strict();
const wearWatchSchema = z
  .object({ templateId, name: itemName, thresholdPercent: z.number().int().min(1).max(100) })
  .strict();
export const ITEM_KINDS = ['any', 'equipped', 'durable', 'supplies'] as const;
export const itemKindLabel: Record<(typeof ITEM_KINDS)[number], string> = {
  any: 'Any item',
  equipped: 'Equipped gear (character gear or loadout slots)',
  durable: 'Gear reporting durability',
  supplies: 'Supplies without reported durability',
};
const SOURCE_KINDS = ['any', 'character', 'base', 'vehicle'] as const;
export const savedFilterSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(60),
    text: z.string().trim().max(128),
    minGrade: grade.nullable(),
    maxGrade: grade.nullable(),
    kind: z.enum(ITEM_KINDS),
    augments: z.enum(['any', 'with', 'without']),
    augmentText: z.string().trim().max(60),
    source: z.enum(SOURCE_KINDS),
    locationText: z.string().trim().max(80),
  })
  .strict()
  .refine((value) => value.minGrade === null || value.maxGrade === null || value.minGrade <= value.maxGrade);
const storageRuleSchema = z
  .object({
    id: z.uuid(),
    containerLabel: z.string().trim().min(1).max(60),
    itemText: z.string().trim().min(1).max(128),
  })
  .strict();
export const plannerSchema = z
  .object({
    loadouts: z.array(loadoutSchema).max(LOADOUT_LIMIT).refine(uniqueIds),
    watchlist: z.array(wearWatchSchema).max(WATCH_LIMIT).refine(uniqueTemplates),
    filters: z.array(savedFilterSchema).max(FILTER_LIMIT).refine(uniqueIds),
    storageRules: z.array(storageRuleSchema).max(STORAGE_RULE_LIMIT).refine(uniqueIds),
  })
  .strict();
export const plannerRecordSchema = z.object({ revision: z.uuid().nullable(), planner: plannerSchema }).strict();
export type Loadout = z.infer<typeof loadoutSchema>;
export type LoadoutItem = z.infer<typeof loadoutItemSchema>;
export type WearWatch = z.infer<typeof wearWatchSchema>;
export type SavedFilter = z.infer<typeof savedFilterSchema>;
export type StorageRule = z.infer<typeof storageRuleSchema>;
export type Planner = z.infer<typeof plannerSchema>;
export type PlannerRecord = z.infer<typeof plannerRecordSchema>;
export const emptyPlanner = (): Planner => ({ loadouts: [], watchlist: [], filters: [], storageRules: [] });

/** Equipment observation with the source metadata needed by planning tools. */
export interface ObservedItem extends FoundItem {
  sourceKind: 'character' | 'base' | 'vehicle';
  container: string;
  containerKey: string;
  group: string | null;
}
export interface ContainerReading {
  key: string;
  label: string;
  location: string;
  href: string;
  sourceKind: 'base' | 'vehicle';
  usedSlots: number;
  /** Null unless every inventory in the container reported an exact slot capacity. */
  maxSlots: number | null;
}
export interface InventoryObservation extends FinderResult {
  items: ObservedItem[];
  containers: ContainerReading[];
}
export type Coverage = Omit<FinderResult, 'items'>;

export function coverageComplete(coverage: Coverage): boolean {
  return !coverage.limited && coverage.sources.length > 0 && coverage.sources.every((s) => s.status === 'ok');
}
const exactQuantity = (value: string): bigint | null => (/^[0-9]{1,200}$/.test(value) ? BigInt(value) : null);
function gradeValue(value: string): number | null {
  return /^[0-9]{1,2}$/.test(value) ? Number(value) : null;
}
/** Parses the finder's `current / max` text. Missing, zero or inconsistent maxima stay unknown. */
export function durabilityReading(value: string): { current: number; max: number; percent: number } | null {
  const match = /^(-?[0-9]+(?:\.[0-9]+)?) \/ ([0-9]+(?:\.[0-9]+)?)$/.exec(value);
  if (!match) return null;
  const current = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0 || current < 0 || current > max) return null;
  return { current, max, percent: Math.floor((current / max) * 100) };
}
const sameTemplate = (item: { templateId: string }, template: string) =>
  item.templateId.toLowerCase() === template.toLowerCase();

// ---- N004 readiness and N007 resupply ----
export type ReadinessStatus = 'ready' | 'missing' | 'unsuitable' | 'unconfirmed';
export interface ReadinessEntry {
  templateId: string;
  name: string;
  required: string;
  suitable: string;
  unsuitable: string;
  unverified: string;
  shortfall: string;
  status: ReadinessStatus;
  reasons: string[];
  locations: string[];
}
export interface LoadoutReadiness {
  loadoutId: string;
  name: string;
  purpose: LoadoutPurpose;
  ready: boolean;
  entries: ReadinessEntry[];
}

/**
 * Suitable stacks meet every saved requirement with a known reading. A lower bound that already covers the
 * requirement is ready even with partial coverage; any other gap stays unconfirmed unless coverage is complete.
 */
export function loadoutReadiness(loadout: Loadout, items: ObservedItem[], coverage: Coverage): LoadoutReadiness {
  const complete = coverageComplete(coverage);
  const entries = loadout.items.map((entry): ReadinessEntry => {
    let suitable = 0n;
    let unsuitable = 0n;
    let unverified = 0n;
    let unknownQuantity = false;
    const reasons = new Set<string>();
    const locations: string[] = [];
    for (const item of items) {
      if (!sameTemplate(item, entry.templateId)) continue;
      const quantity = exactQuantity(item.quantity);
      if (quantity === null) {
        unknownQuantity = true;
        reasons.add('Some stacks did not report an exact quantity.');
        continue;
      }
      let verdict: 'ok' | 'bad' | 'unknown' = 'ok';
      if (entry.minGrade !== null) {
        const value = gradeValue(item.grade);
        if (value === null) verdict = 'unknown';
        else if (value < entry.minGrade) {
          verdict = 'bad';
          reasons.add(`Grade below ${entry.minGrade}.`);
        }
      }
      if (entry.minDurabilityPercent !== null && verdict !== 'bad') {
        const reading = durabilityReading(item.durability);
        if (reading === null) verdict = 'unknown';
        else if (reading.percent < entry.minDurabilityPercent) {
          verdict = 'bad';
          reasons.add(`Durability below ${entry.minDurabilityPercent}%.`);
        }
      }
      if (verdict === 'unknown') reasons.add('Grade or durability was not reported for some stacks.');
      if (verdict === 'ok') {
        suitable += quantity;
        if (locations.length < 5) locations.push(item.location);
      } else if (verdict === 'bad') unsuitable += quantity;
      else unverified += quantity;
    }
    const required = BigInt(entry.quantity);
    let status: ReadinessStatus;
    if (suitable >= required) status = 'ready';
    else if (!complete || unknownQuantity || unverified > 0n) status = 'unconfirmed';
    else if (suitable + unsuitable >= required) status = 'unsuitable';
    else status = 'missing';
    if (status === 'unconfirmed' && !complete) reasons.add('Source coverage was incomplete.');
    return {
      templateId: entry.templateId,
      name: entry.name,
      required: entry.quantity,
      suitable: String(suitable),
      unsuitable: String(unsuitable),
      unverified: String(unverified),
      shortfall: String(suitable >= required ? 0n : required - suitable),
      status,
      reasons: status === 'ready' ? [] : [...reasons],
      locations,
    };
  });
  return {
    loadoutId: loadout.id,
    name: loadout.name,
    purpose: loadout.purpose,
    ready: entries.every((entry) => entry.status === 'ready'),
    entries,
  };
}

export interface ResupplyStep {
  templateId: string;
  text: string;
  certain: boolean;
}
/** N007: one actionable line per unready entry; uncertain gaps say "up to" rather than inventing a need. */
export function resupplyChecklist(readiness: LoadoutReadiness): ResupplyStep[] {
  return readiness.entries
    .filter((entry) => entry.status !== 'ready')
    .map((entry) => {
      const have = `${entry.suitable} suitable of ${entry.required} required`;
      if (entry.status === 'unsuitable')
        return {
          templateId: entry.templateId,
          certain: true,
          text: `Repair, upgrade or replace ${entry.name}: ${have}; ${entry.unsuitable} observed below requirements.`,
        };
      if (entry.status === 'missing')
        return { templateId: entry.templateId, certain: true, text: `Get ${entry.shortfall} ${entry.name} (${have}).` };
      return {
        templateId: entry.templateId,
        certain: false,
        text: `Check ${entry.name}: up to ${entry.shortfall} more may be needed (${have}; coverage or readings incomplete).`,
      };
    });
}

// ---- N005 side-by-side comparison ----
export interface GearComparisonRow {
  label: string;
  values: string[];
  /** Indexes holding the best known value; empty when fewer than two values are known. */
  best: number[];
  unknown: number[];
}
export function compareGear(items: FoundItem[]): GearComparisonRow[] {
  const selected = items.slice(0, COMPARE_LIMIT);
  const row = (label: string, values: string[], scores: (number | null)[]): GearComparisonRow => {
    const known = scores.filter((score): score is number => score !== null);
    const top = known.length >= 2 ? Math.max(...known) : null;
    return {
      label,
      values,
      best:
        top === null || known.every((score) => score === top) ? [] : scores.flatMap((s, i) => (s === top ? [i] : [])),
      unknown: scores.flatMap((score, index) => (score === null ? [index] : [])),
    };
  };
  const durability = selected.map((item) => durabilityReading(item.durability));
  return [
    row(
      'Grade',
      selected.map((item) => (gradeValue(item.grade) === null ? 'Unknown' : item.grade)),
      selected.map((item) => gradeValue(item.grade)),
    ),
    row(
      'Durability',
      selected.map((item, index) =>
        durability[index] ? `${item.durability} (${durability[index]!.percent}%)` : 'Unknown',
      ),
      durability.map((reading) => reading?.percent ?? null),
    ),
    row(
      'Maximum durability',
      durability.map((reading) => (reading ? String(reading.max) : 'Unknown')),
      durability.map((reading) => reading?.max ?? null),
    ),
    row(
      'Augments',
      selected.map((item) => (item.augments.length ? item.augments.join(', ') : 'None reported')),
      // Augment counts are shown, never ranked: their effects are not reported.
      selected.map(() => null),
    ),
    row(
      'Location',
      selected.map((item) => item.location),
      selected.map(() => null),
    ),
  ].map((entry) => (entry.label === 'Augments' || entry.label === 'Location' ? { ...entry, unknown: [] } : entry));
}

// ---- N006 wear watchlist ----
export interface WearReading {
  templateId: string;
  name: string;
  thresholdPercent: number;
  stacks: { location: string; durability: string; percent: number | null; status: 'below' | 'ok' | 'unknown' }[];
  below: number;
  unknown: number;
  limited: boolean;
}
export function wearReadings(watchlist: WearWatch[], items: ObservedItem[]): WearReading[] {
  return watchlist.map((watch) => {
    const matches = items.filter((item) => sameTemplate(item, watch.templateId));
    const stacks = matches.map((item) => {
      const reading = durabilityReading(item.durability);
      const status: 'below' | 'ok' | 'unknown' =
        reading === null ? 'unknown' : reading.percent < watch.thresholdPercent ? 'below' : 'ok';
      return { location: item.location, durability: item.durability, percent: reading?.percent ?? null, status };
    });
    const order = { below: 0, unknown: 1, ok: 2 } as const;
    stacks.sort((a, b) => order[a.status] - order[b.status] || (a.percent ?? 101) - (b.percent ?? 101));
    return {
      ...watch,
      stacks: stacks.slice(0, 20),
      below: stacks.filter((stack) => stack.status === 'below').length,
      unknown: stacks.filter((stack) => stack.status === 'unknown').length,
      limited: stacks.length > 20,
    };
  });
}

// ---- N009 reusable filters ----
export function matchesFilter(filter: SavedFilter, item: ObservedItem): boolean {
  const text = filter.text.toLowerCase();
  if (text && !item.name.toLowerCase().includes(text) && !item.templateId.toLowerCase().includes(text)) return false;
  if (filter.minGrade !== null || filter.maxGrade !== null) {
    const value = gradeValue(item.grade);
    // Unknown grades never satisfy a grade bound.
    if (value === null) return false;
    if (filter.minGrade !== null && value < filter.minGrade) return false;
    if (filter.maxGrade !== null && value > filter.maxGrade) return false;
  }
  const durable = durabilityReading(item.durability) !== null;
  if (filter.kind === 'equipped' && item.group !== 'Character gear' && item.group !== 'Loadout') return false;
  if (filter.kind === 'durable' && !durable) return false;
  if (filter.kind === 'supplies' && durable) return false;
  if (filter.augments === 'with' && item.augments.length === 0) return false;
  if (filter.augments === 'without' && item.augments.length > 0) return false;
  const augmentText = filter.augmentText.toLowerCase();
  if (augmentText && !item.augments.some((augment) => augment.toLowerCase().includes(augmentText))) return false;
  if (filter.source !== 'any' && item.sourceKind !== filter.source) return false;
  const locationText = filter.locationText.toLowerCase();
  if (locationText && !item.location.toLowerCase().includes(locationText)) return false;
  return true;
}
/** Default equipment view when no saved filter is chosen: gear that reports durability. */
export function defaultGearFilter(): SavedFilter {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    name: 'Gear reporting durability',
    text: '',
    minGrade: null,
    maxGrade: null,
    kind: 'durable',
    augments: 'any',
    augmentText: '',
    source: 'any',
    locationText: '',
  };
}

// ---- N010 storage suggestions ----
export interface StorageSuggestion {
  templateId: string;
  name: string;
  quantity: string;
  from: string;
  destinations: {
    label: string;
    location: string;
    href: string;
    freeSlots: number;
    rule: string;
    holdsSame: boolean;
  }[];
  unverified: { label: string; location: string; rule: string }[];
}
/**
 * Suggest only containers whose own label matches the member's rule and whose free slots were verified.
 * Matching containers without a reported capacity are listed separately and never recommended.
 */
export function storageSuggestions(
  rules: StorageRule[],
  items: ObservedItem[],
  containers: ContainerReading[],
): StorageSuggestion[] {
  const loose = items.filter((item) => item.sourceKind === 'character' && item.group === 'Backpack');
  const suggestions: StorageSuggestion[] = [];
  for (const item of loose) {
    const name = item.name.toLowerCase();
    const template = item.templateId.toLowerCase();
    const matching = rules.filter((rule) => {
      const text = rule.itemText.toLowerCase();
      return name.includes(text) || template.includes(text);
    });
    if (!matching.length) continue;
    const destinations: StorageSuggestion['destinations'] = [];
    const unverified: StorageSuggestion['unverified'] = [];
    for (const container of containers) {
      const rule = matching.find((candidate) =>
        container.label.toLowerCase().includes(candidate.containerLabel.toLowerCase()),
      );
      if (!rule) continue;
      const ruleText = `${rule.containerLabel} ← ${rule.itemText}`;
      if (container.maxSlots === null) {
        unverified.push({ label: container.label, location: container.location, rule: ruleText });
        continue;
      }
      const freeSlots = container.maxSlots - container.usedSlots;
      if (freeSlots <= 0) continue;
      destinations.push({
        label: container.label,
        location: container.location,
        href: container.href,
        freeSlots,
        rule: ruleText,
        holdsSame: items.some((other) => other.containerKey === container.key && sameTemplate(other, template)),
      });
    }
    destinations.sort((a, b) => Number(b.holdsSame) - Number(a.holdsSame) || b.freeSlots - a.freeSlots);
    suggestions.push({
      templateId: item.templateId,
      name: item.name,
      quantity: item.quantity,
      from: item.location,
      destinations: destinations.slice(0, 5),
      unverified: unverified.slice(0, 5),
    });
    if (suggestions.length >= 50) break;
  }
  return suggestions;
}

// ---- N008 observed change history ----
export const SNAPSHOT_LIMIT = 6;
const SNAPSHOT_TEMPLATE_LIMIT = 150;
export const HISTORY_MAX_BYTES = 256 * 1024;
export const snapshotSchema = z
  .object({
    id: z.uuid(),
    takenAt: z.iso.datetime(),
    complete: z.boolean(),
    truncated: z.boolean(),
    totals: z
      .array(
        z
          .object({
            templateId,
            name: z.string().min(1).max(80),
            quantity: z.string().regex(/^[0-9]{1,40}$/),
            exact: z.boolean(),
          })
          .strict(),
      )
      .max(SNAPSHOT_TEMPLATE_LIMIT),
  })
  .strict();
export const historyRecordSchema = z
  .object({ revision: z.uuid().nullable(), snapshots: z.array(snapshotSchema).max(SNAPSHOT_LIMIT) })
  .strict();
export type InventorySnapshot = z.infer<typeof snapshotSchema>;
export type HistoryRecord = z.infer<typeof historyRecordSchema>;

/** Aggregates exact per-template totals only. No locations or stack rows are retained. */
export function summarizeSnapshot(observation: InventoryObservation, id: string, takenAt: string): InventorySnapshot {
  const totals = new Map<string, { templateId: string; name: string; quantity: bigint; exact: boolean }>();
  for (const item of observation.items) {
    if (!item.templateId) continue;
    const key = item.templateId.toLowerCase();
    const entry = totals.get(key) ?? {
      templateId: item.templateId,
      name: item.name.slice(0, 80),
      quantity: 0n,
      exact: true,
    };
    const quantity = exactQuantity(item.quantity);
    if (quantity === null || quantity > 10n ** 39n) entry.exact = false;
    else entry.quantity += quantity;
    totals.set(key, entry);
  }
  const sorted = [...totals.values()].sort((a, b) => a.templateId.localeCompare(b.templateId));
  return {
    id,
    takenAt,
    complete: coverageComplete(observation),
    truncated: sorted.length > SNAPSHOT_TEMPLATE_LIMIT,
    totals: sorted.slice(0, SNAPSHOT_TEMPLATE_LIMIT).map((entry) => ({
      templateId: entry.templateId,
      name: entry.name || entry.templateId,
      quantity: String(entry.quantity),
      exact: entry.exact,
    })),
  };
}
export interface SnapshotChange {
  templateId: string;
  name: string;
  before: string;
  after: string;
  delta: string;
  /** Observed when both snapshots fully covered this template; otherwise the change may reflect coverage gaps. */
  certain: boolean;
}
export function snapshotChanges(before: InventorySnapshot, after: InventorySnapshot): SnapshotChange[] {
  const previous = new Map(before.totals.map((entry) => [entry.templateId.toLowerCase(), entry]));
  const next = new Map(after.totals.map((entry) => [entry.templateId.toLowerCase(), entry]));
  const changes: SnapshotChange[] = [];
  for (const key of new Set([...previous.keys(), ...next.keys()])) {
    const a = previous.get(key);
    const b = next.get(key);
    const delta = BigInt(b?.quantity ?? '0') - BigInt(a?.quantity ?? '0');
    if (delta === 0n) continue;
    // A template absent from a truncated snapshot is unknown, not zero.
    const covered = (snapshot: InventorySnapshot, entry: typeof a) =>
      snapshot.complete && (entry ? entry.exact : !snapshot.truncated);
    changes.push({
      templateId: (b ?? a)!.templateId,
      name: (b ?? a)!.name,
      before: a?.quantity ?? '0',
      after: b?.quantity ?? '0',
      delta: delta > 0n ? `+${delta}` : String(delta),
      certain: covered(before, a) && covered(after, b),
    });
  }
  return changes.sort((x, y) => Number(y.certain) - Number(x.certain) || x.name.localeCompare(y.name)).slice(0, 200);
}
