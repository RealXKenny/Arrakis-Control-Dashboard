import { z } from 'zod';
import { toDecimalString } from '../../lib/format';
import { label, record, rows } from '../player/inventory';
import type { PortalProfile } from '../portal/view-model';
import type { BuildDraft, PlannerRecord, StoredGoal } from './model';

/**
 * Pure, browser-safe normalization and comparison for the progression planner. Every value is an observation from
 * the Console at `capturedAt`; a missing section stays `null` (unknown), never zero, and nothing here invents history.
 */
const MAX_ROWS = 24;
const MAX_ASSETS = 25;
const MAX_JOURNEY = 1000;
const MAX_SCHEMATICS = 200;
export const journeyGroups = ['story', 'contract', 'codex', 'tutorial'] as const;

const decimal = z.string().regex(/^-?(0|[1-9][0-9]{0,29})$/);
const named = z.object({ name: z.string().min(1).max(80), value: decimal.nullable() }).strict();
const asset = z.object({ id: z.string().min(1).max(80), name: z.string().min(1).max(80) }).strict();
export const snapshotSchema = z
  .object({
    at: z.iso.datetime(),
    level: decimal.nullable(),
    xp: decimal.nullable(),
    credit: decimal.nullable(),
    pocket: decimal.nullable(),
    factions: z.array(named).max(MAX_ROWS).nullable(),
    specs: z.array(named).max(MAX_ROWS).nullable(),
    journey: z
      .object(Object.fromEntries(journeyGroups.map((group) => [group, z.number().int().min(0).max(100000)])))
      .strict()
      .nullable(),
    bases: z.array(asset).max(MAX_ASSETS).nullable(),
    vehicles: z.array(asset).max(MAX_ASSETS).nullable(),
  })
  .strict();
export type Snapshot = z.infer<typeof snapshotSchema>;
export type JourneyNode = { id: string; group: (typeof journeyGroups)[number]; complete: boolean };
export type Reading = Snapshot & {
  unspentSkillPoints: string | null;
  journeyNodes: JourneyNode[] | null;
  journeyLimited: boolean;
  schematics: string[] | null;
};

/** Whole integers only; fractional or oversized values become unknown rather than a rounded figure. */
export function exactInteger(value: unknown): string | null {
  const text = toDecimalString(value);
  if (!text || !/^-?(0|[1-9][0-9]{0,29})$/.test(text)) return null;
  return text;
}
const short = (value: unknown, max = 80): string | null => {
  const text = label(value, '').trim();
  return text && text.length <= max ? text : null;
};
function namedRows(value: unknown, names: string[], values: string[]) {
  const list = rows(value);
  if (!list) return null;
  const seen = new Set<string>();
  const out: z.infer<typeof named>[] = [];
  for (const row of list) {
    const name = short(names.map((key) => row[key]).find((entry) => entry != null));
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push({ name, value: exactInteger(values.map((key) => row[key]).find((entry) => entry != null)) });
    if (out.length >= MAX_ROWS) break;
  }
  return out;
}
function balances(currency: unknown, coin: unknown) {
  const data = record(currency);
  let credit: string | null = null;
  if (data.supported !== false) {
    const list = Array.isArray(data.rows) ? data.rows.map(record) : null;
    if (list) {
      // The Console reports Solari credit as currency 0; balances arrive as strings.
      const row = list.find((entry) => entry.currency_id === 0 || /solari/i.test(label(entry.label, '')));
      credit = row ? exactInteger(row.balance) : null;
    } else credit = exactInteger(data.total ?? data.balance);
  }
  const pocketData = record(coin);
  const pocket = pocketData.supported === false ? null : exactInteger(pocketData.total);
  return { credit, pocket };
}
function journey(value: unknown): { nodes: JourneyNode[] | null; limited: boolean } {
  const response = record(value);
  if (response.supported === false) return { nodes: null, limited: false };
  const groups = record(response.rows);
  if (!Object.keys(groups).length) return { nodes: null, limited: false };
  const nodes: JourneyNode[] = [];
  let limited = false;
  for (const group of journeyGroups) {
    for (const row of rows(groups[group]) ?? []) {
      const id = short(row.id, 128);
      if (!id) continue;
      if (nodes.length >= MAX_JOURNEY) {
        limited = true;
        break;
      }
      nodes.push({ id, group, complete: row.complete === true });
    }
  }
  return { nodes, limited };
}
function journeyCounts(value: unknown): Snapshot['journey'] {
  const response = record(value);
  if (response.supported === false) return null;
  const groups = record(response.rows);
  if (!Object.keys(groups).length) return null;
  return Object.fromEntries(
    journeyGroups.map((group) => [group, (rows(groups[group]) ?? []).filter((row) => row.complete === true).length]),
  ) as Snapshot['journey'];
}
const assets = (list: { id: string; name: string }[] | null | undefined) =>
  list
    ? list
        .filter((entry) => entry.id && entry.id.length <= 80)
        .slice(0, MAX_ASSETS)
        .map((entry) => ({ id: entry.id, name: (entry.name || 'Unnamed').slice(0, 80) }))
    : null;

export function readingFromProfile(
  profile: Pick<PortalProfile, 'details' | 'bases' | 'vehicles' | 'character'>,
  capturedAt: string,
): Reading {
  const details = profile.details;
  const progression = record(details.progression);
  const available = (name: string) => details[name] != null && record(details[name]).supported !== false;
  const { credit, pocket } = balances(details.currency, details['solaris-coin']);
  const nodes = journey(details.journey);
  const inventory = rows(details.inventory);
  return {
    at: capturedAt,
    level: available('progression') ? exactInteger(progression.level ?? progression.characterLevel) : null,
    xp: available('progression') ? exactInteger(progression.xp ?? progression.experience) : null,
    unspentSkillPoints: available('progression') ? exactInteger(progression.unspentSkillPoints) : null,
    credit,
    pocket,
    factions: namedRows(
      details.factions,
      ['faction_name', 'name', 'faction_id'],
      ['reputation_amount', 'reputation', 'value'],
    ),
    specs: namedRows(details.specs, ['track_name', 'name', 'track_type'], ['level']),
    journey: journeyCounts(details.journey),
    journeyNodes: nodes.nodes,
    journeyLimited: nodes.limited,
    schematics: inventory
      ? inventory
          .filter((row) => String(row.inventory_type) === '30')
          .map((row) => short(row.display_name ?? row.item_name ?? row.name))
          .filter((name): name is string => Boolean(name))
          .slice(0, MAX_SCHEMATICS)
      : null,
    bases: details.bases == null ? null : assets(profile.bases),
    vehicles: details.vehicles == null ? null : assets(profile.vehicles),
  };
}
export function snapshotOf(reading: Reading): Snapshot {
  return snapshotSchema.parse({
    at: reading.at,
    level: reading.level,
    xp: reading.xp,
    credit: reading.credit,
    pocket: reading.pocket,
    factions: reading.factions,
    specs: reading.specs,
    journey: reading.journey,
    bases: reading.bases,
    vehicles: reading.vehicles,
  });
}

const find = (list: { name: string; value?: string | null }[] | null | undefined, name: string) =>
  list?.find((entry) => entry.name.toLowerCase() === name.trim().toLowerCase()) ?? null;

export type GoalProgress = {
  state: 'met' | 'open' | 'unknown';
  current: string | null;
  target: string | null;
  /** How far the observation is from the target, when both are exact integers. */
  remaining: string | null;
  detail: string;
};
export function goalProgress(goal: StoredGoal, reading: Reading | null): GoalProgress {
  if (goal.kind === 'custom')
    return {
      state: goal.done ? 'met' : 'open',
      current: null,
      target: null,
      remaining: null,
      detail: goal.done ? 'Marked done by you.' : 'Completed by hand.',
    };
  if (!reading) return unknown(goal, 'Character readings are unavailable.');
  if (goal.kind === 'journey') {
    if (!reading.journeyNodes) return unknown(goal, 'Journey readings are unavailable.');
    const node = reading.journeyNodes.find((entry) => entry.id === goal.ref);
    if (!node)
      return unknown(
        goal,
        reading.journeyLimited
          ? 'Objective not in the bounded reading.'
          : 'The Console does not report this objective.',
      );
    return {
      state: node.complete ? 'met' : 'open',
      current: null,
      target: null,
      remaining: null,
      detail: node.complete ? 'Reported complete.' : 'Not yet reported complete.',
    };
  }
  let current: string | null = null;
  let source = '';
  if (goal.kind === 'level') [current, source] = [reading.level, 'Level'];
  if (goal.kind === 'solari')
    [current, source] =
      goal.balance === 'pocket' ? [reading.pocket, 'Pocket Solari'] : [reading.credit, 'Solari credit'];
  if (goal.kind === 'faction') {
    if (!reading.factions) return unknown(goal, 'Faction readings are unavailable.');
    const entry = find(reading.factions, goal.ref);
    if (!entry) return unknown(goal, 'The Console does not report this faction.');
    [current, source] = [entry.value, entry.name];
  }
  if (goal.kind === 'specialization') {
    if (!reading.specs) return unknown(goal, 'Specialization readings are unavailable.');
    const entry = find(reading.specs, goal.ref);
    if (!entry) return unknown(goal, 'The Console does not report this specialization.');
    [current, source] = [entry.value, entry.name];
  }
  if (current === null) return unknown(goal, `${source || 'This reading'} is unavailable.`);
  const gap = BigInt(goal.target) - BigInt(current);
  return {
    state: gap <= 0n ? 'met' : 'open',
    current,
    target: goal.target,
    remaining: gap > 0n ? gap.toString() : '0',
    detail: `${source} observed at ${current}.`,
  };
}
function unknown(goal: StoredGoal, detail: string): GoalProgress {
  return { state: 'unknown', current: null, target: goal.target || null, remaining: null, detail };
}

export type BuildComparison = {
  track: string;
  planned: number;
  current: string | null;
  gap: string | null;
}[];
export function compareBuild(build: Pick<BuildDraft, 'targets'>, reading: Reading | null): BuildComparison {
  return build.targets.map((target) => {
    const entry = reading?.specs ? find(reading.specs, target.track) : null;
    const current = entry?.value ?? null;
    return {
      track: target.track,
      planned: target.level,
      current,
      gap: current === null ? null : (BigInt(target.level) - BigInt(current)).toString(),
    };
  });
}

/** An exact name match with a held schematic is an observation, not proof that the recipe is unlocked. */
export function schematicObserved(name: string, reading: Reading | null): boolean | null {
  if (!reading?.schematics) return null;
  return reading.schematics.some((entry) => entry.toLowerCase() === name.trim().toLowerCase());
}

export type JournalChange = { label: string; from: string | null; to: string | null; delta: string | null };
export type JournalEntry = { from: string; to: string; changes: JournalChange[]; unobserved: string[] };
const diff = (a: string | null, b: string | null) =>
  a === null || b === null ? null : (BigInt(b) - BigInt(a)).toString();
function scalarChanges(previous: Snapshot, next: Snapshot, changes: JournalChange[], unobserved: string[]) {
  for (const [key, title] of [
    ['level', 'Level'],
    ['xp', 'Experience'],
    ['credit', 'Solari credit'],
    ['pocket', 'Pocket Solari'],
  ] as const) {
    if (previous[key] === null || next[key] === null) unobserved.push(title);
    else if (previous[key] !== next[key])
      changes.push({ label: title, from: previous[key], to: next[key], delta: diff(previous[key], next[key]) });
  }
}
function namedChanges(
  title: string,
  previous: Snapshot['factions'],
  next: Snapshot['factions'],
  changes: JournalChange[],
  unobserved: string[],
) {
  if (!previous || !next) return void unobserved.push(title);
  for (const entry of next) {
    const before = find(previous, entry.name);
    if (!before) continue;
    if (before.value === null || entry.value === null) unobserved.push(`${title}: ${entry.name}`);
    else if (before.value !== entry.value)
      changes.push({
        label: `${title}: ${entry.name}`,
        from: before.value,
        to: entry.value,
        delta: diff(before.value, entry.value),
      });
  }
}
export function assetChanges(previous: Snapshot, next: Pick<Snapshot, 'bases' | 'vehicles'>) {
  const result: { kind: 'Base' | 'Vehicle'; change: 'added' | 'removed'; name: string }[] = [];
  const unobserved: string[] = [];
  for (const [key, kind] of [
    ['bases', 'Base'],
    ['vehicles', 'Vehicle'],
  ] as const) {
    const before = previous[key];
    const after = next[key];
    if (!before || !after) {
      unobserved.push(kind === 'Base' ? 'Bases' : 'Vehicles');
      continue;
    }
    // A full bounded list cannot prove an asset disappeared, only that it is no longer among the listed rows.
    const full = before.length >= MAX_ASSETS || after.length >= MAX_ASSETS;
    const ids = new Set(before.map((entry) => entry.id));
    const afterIds = new Set(after.map((entry) => entry.id));
    for (const entry of after) if (!ids.has(entry.id)) result.push({ kind, change: 'added', name: entry.name });
    if (!full)
      for (const entry of before)
        if (!afterIds.has(entry.id)) result.push({ kind, change: 'removed', name: entry.name });
  }
  return { changes: result, unobserved };
}
export function compareSnapshots(previous: Snapshot, next: Snapshot): JournalEntry {
  const changes: JournalChange[] = [];
  const unobserved: string[] = [];
  scalarChanges(previous, next, changes, unobserved);
  namedChanges('Faction', previous.factions, next.factions, changes, unobserved);
  namedChanges('Specialization', previous.specs, next.specs, changes, unobserved);
  if (!previous.journey || !next.journey) unobserved.push('Journey');
  else
    for (const group of journeyGroups) {
      const before = previous.journey[group];
      const after = next.journey[group];
      if (before !== after)
        changes.push({
          label: `Journey ${group} objectives complete`,
          from: String(before),
          to: String(after),
          delta: String(after - before),
        });
    }
  const owned = assetChanges(previous, next);
  for (const entry of owned.changes)
    changes.push({ label: `${entry.kind} ${entry.change}: ${entry.name}`, from: null, to: null, delta: null });
  unobserved.push(...owned.unobserved);
  return { from: previous.at, to: next.at, changes, unobserved };
}
/** Newest first. The oldest snapshot is the tracking baseline: nothing before it is claimed. */
export function journalEntries(snapshots: Snapshot[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  for (let index = snapshots.length - 1; index > 0; index--)
    entries.push(compareSnapshots(snapshots[index - 1], snapshots[index]));
  return entries;
}
/** Bounded observed history for one faction, oldest first, with unknown readings kept explicit. */
export function factionSeries(snapshots: Snapshot[], faction: string, limit = 12) {
  return snapshots.slice(-limit).map((snapshot) => ({
    at: snapshot.at,
    value: snapshot.factions ? (find(snapshot.factions, faction)?.value ?? null) : null,
  }));
}

export type Briefing = {
  since: string | null;
  changes: JournalEntry | null;
  outstandingGoals: { id: string; title: string; progress: GoalProgress }[];
  openChecklist: number;
};
export function buildBriefing(planner: PlannerRecord, reading: Reading | null, previous: Snapshot | null): Briefing {
  const outstandingGoals = planner.goals
    .map((goal) => ({ id: goal.id, title: goal.title, progress: goalProgress(goal, reading) }))
    .filter((goal) => goal.progress.state !== 'met')
    .sort((a, b) => Number(b.progress.state === 'open') - Number(a.progress.state === 'open'));
  return {
    since: previous?.at ?? null,
    changes: previous && reading ? compareSnapshots(previous, snapshotOf(reading)) : null,
    outstandingGoals,
    openChecklist: planner.checklist.filter((item) => !item.done).length,
  };
}
