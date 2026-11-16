import '../../../lib/assert-server';
import { z } from 'zod';
import { record } from '../../../lib/value';
import { journeyGroups, type Assignment, type Challenge } from '../contracts';
import { describeKind, progressOf, satisfied, type Measurement } from '../engine/kinds';
import { fail } from './store';

const decimal = z.string().regex(/^(0|[1-9][0-9]{0,24})$/);
export const baselineSchema = z
  .object({
    version: z.literal(1),
    pawn: z.string().regex(/^[1-9][0-9]{0,19}$/),
    controller: z.string().regex(/^[1-9][0-9]{0,19}$/),
    at: z.iso.datetime(),
    xp: decimal.nullable(),
    highXp: decimal.nullable(),
    level: z.number().int().min(1).max(1000).nullable(),
    nodes: z
      .array(
        z
          .object({
            id: z.string().regex(/^[A-Za-z0-9_.:/-]{1,200}$/),
            complete: z.boolean(),
            earned: z.boolean(),
            group: z.enum(journeyGroups).optional(),
          })
          .strict(),
      )
      .max(5000),
  })
  .strict();
export type Baseline = z.infer<typeof baselineSchema>;
type Character = { pawn: string; controller: string };
const canonical = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : null;
function source(raw: unknown, character: Character, capability: string) {
  if (Buffer.byteLength(JSON.stringify(raw) ?? '') > 2 * 1024 * 1024)
    fail('Game observation exceeds the safe limit.', 502);
  const data = record(raw),
    player = record(data.player);
  if (
    data.ok === false ||
    data.supported === false ||
    record(data.capabilities)[capability] !== true ||
    canonical(player.actorId) !== character.pawn ||
    canonical(player.controllerId) !== character.controller
  )
    fail('Game observation did not confirm the linked character and capability.', 502);
  return data;
}
/** Only observed false→true transitions qualify; newly appearing completed nodes are historical/unknown. */
export function freshEvidence(
  challenges: Challenge[],
  character: Character,
  snapshots: ReadonlyMap<string, unknown>,
  stored: unknown,
  assignment: Assignment | null = null,
) {
  let xp: string | null = null,
    level: number | null = null;
  if (snapshots.has('progression')) {
    const data = source(snapshots.get('progression'), character, 'progression');
    if (
      typeof data.xp !== 'number' ||
      !Number.isSafeInteger(data.xp) ||
      data.xp < 0 ||
      typeof data.level !== 'number' ||
      !Number.isSafeInteger(data.level) ||
      data.level < 1 ||
      data.level > 1000
    )
      fail('Exact game XP and level observations are unavailable.', 502);
    xp = String(data.xp);
    level = data.level;
  }
  const nodes = new Map<string, boolean>();
  const groupOf = new Map<string, (typeof journeyGroups)[number]>();
  if (snapshots.has('journey')) {
    const rows = record(source(snapshots.get('journey'), character, 'journey').rows);
    for (const group of ['story', 'contract', 'codex', 'tutorial']) {
      if (!Array.isArray(rows[group]) || rows[group].length > 5000)
        fail('Journey data is incomplete or oversized.', 502);
      for (const raw of rows[group]) {
        const node = record(raw);
        if (
          typeof node.id !== 'string' ||
          !/^[A-Za-z0-9_.:/-]{1,200}$/.test(node.id) ||
          typeof node.complete !== 'boolean' ||
          nodes.has(node.id)
        )
          fail('Journey data contains ambiguous objectives.', 502);
        nodes.set(node.id, node.complete);
        groupOf.set(node.id, group as (typeof journeyGroups)[number]);
      }
    }
    if (nodes.size > 5000) fail('Journey data exceeds the safe limit.', 502);
  }
  const old = stored ? baselineSchema.parse(stored) : null;
  if (old && (old.pawn !== character.pawn || old.controller !== character.controller))
    fail(
      'This season tracks a different character. Restore the original link; switching characters cannot reset seasonal tracking.',
      409,
    );
  if (old?.highXp !== null && old?.highXp !== undefined && xp !== null && BigInt(xp) < BigInt(old.highXp))
    fail(
      'The game XP counter decreased. No progress is awarded until it recovers to its previous observed value.',
      409,
    );
  const baseline: Baseline = old
    ? structuredClone(old)
    : { version: 1, ...character, at: new Date().toISOString(), xp, highXp: xp, level, nodes: [] };
  if (xp !== null) {
    if (baseline.xp === null) {
      baseline.xp = xp;
      baseline.level = level;
    }
    baseline.highXp = xp;
  }
  const known = new Map(baseline.nodes.map((n) => [n.id, n]));
  for (const [id, complete] of nodes) {
    const previous = known.get(id);
    if (previous) {
      if (!previous.complete && complete) previous.earned = true;
      if (!previous.group) previous.group = groupOf.get(id);
    } else {
      const node = { id, complete, earned: false, group: groupOf.get(id) };
      baseline.nodes.push(node);
      known.set(id, node);
    }
  }
  if (!baselineSchema.safeParse(baseline).success) fail('Season tracking exceeds its safe limits.', 502);
  if (Buffer.byteLength(JSON.stringify(baseline)) > 512 * 1024)
    fail('Season tracking exceeds its safe storage limit.', 502);
  const proofs = new Map<string, string>();
  const gained = xp !== null && old?.xp !== null && old?.xp !== undefined ? BigInt(xp) - BigInt(old.xp) : 0n;
  const completed = baseline.nodes.filter((n) => n.earned).length;
  const earned = { any: completed, story: 0, contract: 0, codex: 0, tutorial: 0 };
  for (const n of baseline.nodes) if (n.earned && n.group) earned[n.group]++;
  const measurement: Measurement = {
    gainedXp: gained,
    levelsGained: old && old.level !== null && level !== null ? Math.max(0, level - old.level) : 0,
    earned,
  };
  const objectives: Record<string, number> = {};
  if (old)
    for (const c of challenges) {
      if (c.personalized) {
        const kind = assignment?.objectives[c.id];
        if (!kind) continue;
        objectives[c.id] = progressOf(kind, measurement);
        if (satisfied(kind, measurement)) proofs.set(c.id, `New verified progress: ${describeKind(kind)}`);
        continue;
      }
      if (
        c.verification === 'season-progress' &&
        (gained >= BigInt(c.minimumGameXp!) || completed >= c.minimumNewJourneys!)
      )
        proofs.set(c.id, `New seasonal game progress: ${gained} game XP; ${completed} newly completed journey nodes.`);
      if (
        c.verification === 'character-level' &&
        old.level !== null &&
        level !== null &&
        c.minimumLevel! > old.level &&
        level >= c.minimumLevel!
      )
        proofs.set(c.id, `Newly reached game level ${level}; tracking began at ${old.level}.`);
      if (c.verification === 'journey-node' && known.get(c.journeyNode!)?.earned && nodes.get(c.journeyNode!) === true)
        proofs.set(c.id, `Newly completed journey node ${c.journeyNode}.`);
    }
  return {
    baseline,
    proofs,
    established: !old,
    summary: { startedAt: baseline.at, newGameXp: gained.toString(), newJourneys: completed, objectives },
  };
}
