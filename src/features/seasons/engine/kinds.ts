import { journeyGroups, type ObjectiveKind } from '../contracts';
import type { Capability, JourneyGroup, Tier } from './capability';
import { GAME_LEVEL_CAP } from './capability';

const KIND_LABELS: Record<string, string> = {
  'game-xp': 'Game XP',
  levels: 'Character levels',
  'journeys:any': 'Journey objectives',
  'journeys:story': 'Story objectives',
  'journeys:contract': 'Contracts',
  'journeys:codex': 'Codex entries',
  'journeys:tutorial': 'Tutorial steps',
};
export const kindKey = (kind: ObjectiveKind) => (kind.type === 'journeys' ? `journeys:${kind.group}` : kind.type);
export function describeKind(kind: ObjectiveKind) {
  const label = KIND_LABELS[kindKey(kind)];
  if (kind.type === 'game-xp')
    return `Earn ${kind.target.toLocaleString('en-US')} new game XP after your first verified observation this season.`;
  if (kind.type === 'levels')
    return `Gain ${kind.target} new character level${kind.target === 1 ? '' : 's'} after tracking begins.`;
  return `Newly complete ${kind.target} ${label.toLowerCase()} after tracking begins. Anything already complete does not count.`;
}
/** What the server measured since the immutable baseline. */
export type Measurement = {
  gainedXp: bigint;
  levelsGained: number;
  earned: Record<'any' | JourneyGroup, number>;
};
export function satisfied(kind: ObjectiveKind, m: Measurement) {
  if (kind.type === 'game-xp') return m.gainedXp >= BigInt(kind.target);
  if (kind.type === 'levels') return m.levelsGained >= kind.target;
  return m.earned[kind.group] >= kind.target;
}
export function progressOf(kind: ObjectiveKind, m: Measurement) {
  const value =
    kind.type === 'game-xp'
      ? Number(m.gainedXp > BigInt(kind.target) ? BigInt(kind.target) : m.gainedXp)
      : kind.type === 'levels'
        ? m.levelsGained
        : m.earned[kind.group];
  return Math.min(kind.target, Math.max(0, value));
}
const XP_MULTIPLIER: Record<Tier, number> = {
  beginner: 0.5,
  intermediate: 0.8,
  advanced: 1,
  veteran: 1.25,
  endgame: 1.5,
};
const JOURNEY_MULTIPLIER: Record<Tier, number> = {
  beginner: 0.6,
  intermediate: 0.85,
  advanced: 1,
  veteran: 1.2,
  endgame: 1.4,
};
export type Candidate = { kind: ObjectiveKind; headroom: number };
/** Targets scale with relative difficulty (1-20), tier and remaining season time; all adjustments are bounded. */
export function candidateKinds(capability: Capability, difficulty: number, timeFactor: number): Candidate[] {
  const d = Math.max(1, Math.min(20, Math.round(difficulty)));
  const late = Math.max(0.4, Math.min(1, timeFactor));
  const out: Candidate[] = [];
  if (capability.xpSignal)
    out.push({
      kind: {
        type: 'game-xp',
        target: Math.max(500, Math.round((d * 1000 * XP_MULTIPLIER[capability.tier] * late) / 100) * 100),
      },
      headroom: 1,
    });
  if (capability.levelSignal && capability.level !== null) {
    const target = Math.max(1, Math.ceil((d / 5) * XP_MULTIPLIER[capability.tier] * late));
    if (capability.level + target <= GAME_LEVEL_CAP)
      out.push({ kind: { type: 'levels', target }, headroom: 1 - (capability.level + target - 1) / GAME_LEVEL_CAP });
  }
  const base = d * JOURNEY_MULTIPLIER[capability.tier] * late;
  for (const group of ['any', ...journeyGroups] as const) {
    const target = Math.max(1, Math.ceil(group === 'any' ? base : base * 0.6));
    const capacity = capability.capacity[group];
    if (capacity >= target)
      out.push({
        kind: { type: 'journeys', group, target },
        headroom: Math.min(1, 1 - target / (capacity + 1) + 0.1),
      });
  }
  return out;
}
