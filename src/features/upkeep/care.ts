import type { FinderResult } from '../player/item-finder';
import type { BaseLayout } from '../bases/schema';
import {
  DEFAULT_GENERATOR_ALERT_HOURS,
  DEFAULT_WATER_ALERT_PERCENT,
  nextReminderDue,
  type BlueprintSummary,
  type UpkeepRecord,
} from './model';

/** Browser-safe upkeep calculations. Missing readings stay unknown; they never become zero or healthy. */

export interface CareBase {
  id: string;
  name: string;
  owned: boolean;
  water: { percent: number | null; text: string };
  /** Reported generator runtime in seconds, or null when the Console did not report one. */
  generatorSeconds: number | null;
}

export type CarePriority = 'urgent' | 'attention' | 'unknown';
export interface CareItem {
  id: string;
  baseId: string | null;
  kind: 'water' | 'generator' | 'inspection' | 'reminder' | 'unknown';
  priority: CarePriority;
  title: string;
  detail: string;
  /** True when the text includes a projection rather than a reported value. */
  estimate: boolean;
  href: string;
}

export interface WaterSample {
  t: string;
  percent: number | null;
}

export const baseHref = (base: Pick<CareBase, 'id' | 'owned'>) =>
  `/holdings${base.owned ? '' : '?view=shared'}#base-${encodeURIComponent(base.id)}`;
/** Readable, timezone-explicit times for server-built text. */
const utc = (value: number | string) => `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
const known = (value: number | null): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const hoursText = (hours: number) =>
  hours >= 48
    ? `${Math.floor(hours / 24)}d ${Math.floor(hours % 24)}h`
    : `${Math.max(0, Math.floor(hours))}h ${Math.floor((hours % 1) * 60)}m`;

/** N021–N023, N026 and N027 combined. Only bases in the current authorised profile are considered. */
export function buildCareInbox(
  bases: CareBase[],
  record: UpkeepRecord,
  now: number,
  observedAt: string | null,
): CareItem[] {
  const items: CareItem[] = [];
  const settings = new Map(record.bases.map((base) => [base.baseId, base]));
  const visible = new Map(bases.map((base) => [base.id, base]));
  const observed = observedAt ? Date.parse(observedAt) : now;
  for (const base of bases) {
    const own = settings.get(base.id);
    const href = baseHref(base);
    const name = base.name.slice(0, 120);
    const waterLimit = own?.waterAlertPercent ?? DEFAULT_WATER_ALERT_PERCENT;
    if (!known(base.water.percent))
      items.push({
        id: `water-unknown:${base.id}`,
        baseId: base.id,
        kind: 'unknown',
        priority: 'unknown',
        title: `${name}: water reading unknown`,
        detail: 'The Console did not report a usable water level. Check the base in game before relying on it.',
        estimate: false,
        href,
      });
    else if (base.water.percent <= waterLimit)
      items.push({
        id: `water:${base.id}`,
        baseId: base.id,
        kind: 'water',
        priority: base.water.percent === 0 || base.water.percent <= waterLimit / 2 ? 'urgent' : 'attention',
        title: `${name}: water at ${Math.round(base.water.percent)}%`,
        detail: `Reported water is at or below your ${waterLimit}% alert${own?.waterAlertPercent == null ? ' (default)' : ''}. ${base.water.text}.`,
        estimate: false,
        href,
      });
    const hourLimit = own?.generatorAlertHours ?? DEFAULT_GENERATOR_ALERT_HOURS;
    if (base.generatorSeconds === null)
      items.push({
        id: `generator-unknown:${base.id}`,
        baseId: base.id,
        kind: 'unknown',
        priority: 'unknown',
        title: `${name}: generator runtime not reported`,
        detail: 'No supported generator reading is available, so no runtime reminder can be calculated.',
        estimate: false,
        href,
      });
    else {
      const hours = base.generatorSeconds / 3600;
      if (hours <= hourLimit) {
        const until = new Date(observed + base.generatorSeconds * 1000);
        items.push({
          id: `generator:${base.id}`,
          baseId: base.id,
          kind: 'generator',
          priority: hours <= Math.min(2, hourLimit / 4) ? 'urgent' : 'attention',
          title: `${name}: generator runtime ${hoursText(hours)}`,
          detail: `Reported runtime is at or below your ${hourLimit}h reminder${own?.generatorAlertHours == null ? ' (default)' : ''}. Estimated to run out around ${utc(until.getTime())}, assuming consumption stays constant.`,
          estimate: true,
          href,
        });
      }
    }
    if (own?.inspectEveryDays) {
      const last = own.inspections.at(-1)?.at;
      const due = last ? Date.parse(last) + own.inspectEveryDays * 86_400_000 : null;
      if (due === null || due <= now)
        items.push({
          id: `inspection:${base.id}`,
          baseId: base.id,
          kind: 'inspection',
          priority: due !== null && now - due > own.inspectEveryDays * 86_400_000 ? 'urgent' : 'attention',
          title: `${name}: inspection ${last ? 'due' : 'not yet recorded'}`,
          detail: last
            ? `Last inspection recorded ${utc(last)}. Your cadence is every ${own.inspectEveryDays} day(s).`
            : `No inspection recorded. Your cadence is every ${own.inspectEveryDays} day(s).`,
          estimate: false,
          href: `/upkeep?view=bases#upkeep-base-${base.id}`,
        });
    }
  }
  for (const reminder of record.reminders) {
    const due = Date.parse(nextReminderDue(reminder));
    if (due > now) continue;
    if (reminder.baseId && !visible.has(reminder.baseId)) continue;
    const base = reminder.baseId ? visible.get(reminder.baseId) : null;
    items.push({
      id: `reminder:${reminder.id}`,
      baseId: reminder.baseId,
      kind: 'reminder',
      priority: now - due > reminder.everyDays * 86_400_000 ? 'urgent' : 'attention',
      title: `${base ? `${base.name.slice(0, 80)}: ` : ''}${reminder.title}`,
      detail: `Due ${utc(due)}. Recording completion here never performs a game action.`,
      estimate: false,
      href: '/upkeep?view=reminders',
    });
  }
  const rank = { urgent: 0, attention: 1, unknown: 2 } as const;
  return items.sort((a, b) => rank[a.priority] - rank[b.priority] || a.title.localeCompare(b.title)).slice(0, 120);
}

export interface WaterAnalysis {
  /** Unbroken runs of known samples; a new segment starts after a gap or unknown reading. */
  segments: WaterSample[][];
  gaps: { from: string; to: string; hours: number }[];
  unknownSamples: number;
  refills: number;
  /** Average observed decline in percentage points per hour, only when enough evidence exists. */
  usagePerHour: number | null;
  coveredHours: number;
  /** Uncertain projection of when the threshold may be reached. */
  projectedThresholdAt: string | null;
}

const SAMPLE_GAP_HOURS = 2;

/** N028: observed usage only, with gaps, refills and unknown readings kept visible. */
export function analyzeWater(samples: WaterSample[], threshold: number): WaterAnalysis {
  const sorted = samples
    .filter((sample) => Number.isFinite(Date.parse(sample.t)))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  const result: WaterAnalysis = {
    segments: [],
    gaps: [],
    unknownSamples: 0,
    refills: 0,
    usagePerHour: null,
    coveredHours: 0,
    projectedThresholdAt: null,
  };
  let current: WaterSample[] = [];
  let previous: WaterSample | null = null;
  let declined = 0;
  for (const sample of sorted) {
    if (previous) {
      const hours = (Date.parse(sample.t) - Date.parse(previous.t)) / 3_600_000;
      if (hours > SAMPLE_GAP_HOURS) result.gaps.push({ from: previous.t, to: sample.t, hours });
      else if (known(previous.percent) && known(sample.percent)) {
        const delta = sample.percent - previous.percent;
        if (delta > 0.5) result.refills += 1;
        else {
          result.coveredHours += hours;
          declined += Math.max(0, -delta);
        }
      }
      if (hours > SAMPLE_GAP_HOURS && current.length) {
        result.segments.push(current);
        current = [];
      }
    }
    if (!known(sample.percent)) {
      result.unknownSamples += 1;
      if (current.length) result.segments.push(current);
      current = [];
    } else current.push(sample);
    previous = sample;
  }
  if (current.length) result.segments.push(current);
  // Dev note: one hour of evidence is the minimum before we let a cistern tell fortunes.
  if (result.coveredHours >= 1) result.usagePerHour = declined / result.coveredHours;
  const last = sorted.at(-1);
  if (result.usagePerHour && result.usagePerHour > 0 && last && known(last.percent) && last.percent > threshold)
    result.projectedThresholdAt = new Date(
      Date.parse(last.t) + ((last.percent - threshold) / result.usagePerHour) * 3_600_000,
    ).toISOString();
  return result;
}

export interface StockpileLine {
  templateId: string;
  name: string;
  minimum: string;
  observed: string;
  /** below: confirmed shortfall; met: observed at least the target; unknown: incomplete reading below target. */
  status: 'below' | 'met' | 'unknown';
  shortfall: string | null;
}

/** N025: exact BigInt sums. Incomplete coverage can prove a target is met, but never a shortfall. */
export function compareMinimums(
  minimums: { templateId: string; name: string; minimum: string }[],
  reading: Pick<FinderResult, 'items' | 'sources' | 'limited'>,
): StockpileLine[] {
  const complete =
    !reading.limited && reading.sources.length > 0 && reading.sources.every((source) => source.status === 'ok');
  return minimums.map((entry) => {
    let observed = 0n;
    let exact = complete;
    for (const item of reading.items) {
      if (item.templateId.toLowerCase() !== entry.templateId.toLowerCase()) continue;
      if (/^[0-9]{1,200}$/.test(item.quantity)) observed += BigInt(item.quantity);
      else exact = false;
    }
    const minimum = BigInt(entry.minimum);
    const status = observed >= minimum ? 'met' : exact ? 'below' : 'unknown';
    return {
      ...entry,
      observed: String(observed),
      status,
      shortfall: status === 'below' ? String(minimum - observed) : null,
    };
  });
}

/** N029: a compact, comparable description of a layout. The layout itself is not stored. */
export function summarizeBlueprint(layout: BaseLayout): BlueprintSummary {
  const pieces = [...layout.instances, ...layout.placeables];
  const counts = new Map<string, number>();
  for (const piece of pieces) counts.set(piece.building_type, (counts.get(piece.building_type) ?? 0) + 1);
  const ranked = [...counts]
    .map(([type, count]) => ({ type: type.slice(0, 200), count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const types = ranked.slice(0, 40);
  const span = (values: number[]) => (values.length ? Math.max(...values) - Math.min(...values) : 0);
  const xs = pieces.map((piece) => piece.x);
  const ys = pieces.map((piece) => piece.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = span(xs);
  const depth = span(ys);
  const scale = Math.max(width, depth, 1);
  const cells = new Set<string>();
  for (const piece of layout.instances) {
    if (cells.size >= 200) break;
    cells.add(`${Math.round(((piece.x - minX) / scale) * 1000)},${Math.round(((piece.y - minY) / scale) * 1000)}`);
  }
  return {
    pieces: pieces.length,
    placeables: layout.placeables.length,
    baseType: (layout.base_type ?? 'Not recorded').slice(0, 80) || 'Not recorded',
    map: (layout.map ?? 'Not recorded').slice(0, 80) || 'Not recorded',
    types,
    otherTypes: ranked.slice(40).reduce((total, entry) => total + entry.count, 0),
    width,
    depth,
    height: span(pieces.map((piece) => piece.z)),
    footprint: [...cells].map((cell) => cell.split(',').map(Number) as [number, number]),
  };
}

export interface BlueprintDiff {
  pieces: number;
  placeables: number;
  width: number;
  depth: number;
  height: number;
  changes: { type: string; before: number; after: number }[];
  /** True when either side grouped minor piece types, so per-type changes may be incomplete. */
  partial: boolean;
}

export function compareBlueprints(before: BlueprintSummary, after: BlueprintSummary): BlueprintDiff {
  const left = new Map(before.types.map((entry) => [entry.type, entry.count]));
  const right = new Map(after.types.map((entry) => [entry.type, entry.count]));
  const changes = [...new Set([...left.keys(), ...right.keys()])]
    .map((type) => ({ type, before: left.get(type) ?? 0, after: right.get(type) ?? 0 }))
    .filter((entry) => entry.before !== entry.after)
    .sort((a, b) => Math.abs(b.after - b.before) - Math.abs(a.after - a.before) || a.type.localeCompare(b.type));
  return {
    pieces: after.pieces - before.pieces,
    placeables: after.placeables - before.placeables,
    width: after.width - before.width,
    depth: after.depth - before.depth,
    height: after.height - before.height,
    changes,
    partial: before.otherTypes > 0 || after.otherTypes > 0,
  };
}

/** N030 progress across every list in a relocation plan. */
export function relocationProgress(plan: {
  packing: { done: boolean }[];
  cargo: { done: boolean }[];
  tasks: { done: boolean }[];
}) {
  const all = [...plan.packing, ...plan.cargo, ...plan.tasks];
  return { total: all.length, remaining: all.filter((entry) => !entry.done).length };
}
