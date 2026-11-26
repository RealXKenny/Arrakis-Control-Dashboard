import { journeyGroups, tiers } from '../contracts';

/** Documented assumption (Dune: Awakening level cap). It is not verified against the Console and only bounds generation. */
export const GAME_LEVEL_CAP = 200;
export type Tier = (typeof tiers)[number];
export type JourneyGroup = (typeof journeyGroups)[number];
export function tierForLevel(level: number): Tier {
  if (level >= GAME_LEVEL_CAP) return 'endgame';
  if (level >= 150) return 'veteran';
  if (level >= 100) return 'advanced';
  if (level >= 50) return 'intermediate';
  return 'beginner';
}
export type CapabilityInput = {
  level: number | null;
  xp: string | null;
  nodes: ReadonlyArray<{ id: string; complete: boolean; group?: JourneyGroup }>;
};
export type Capability = {
  tier: Tier;
  level: number | null;
  /** Whether game XP and level gains are a usable signal for this character. */
  xpSignal: boolean;
  levelSignal: boolean;
  /** Incomplete journey nodes at enrollment: the most each journey objective could ever require. */
  capacity: Record<'any' | JourneyGroup, number>;
  notes: string[];
};
/** Pure analysis of the immutable enrollment baseline. Never invents data the Console did not report. */
export function analyzeCapability(input: CapabilityInput): Capability {
  const notes: string[] = [];
  const capacity = { any: 0, story: 0, contract: 0, codex: 0, tutorial: 0 };
  for (const node of input.nodes) {
    if (node.complete) continue;
    capacity.any++;
    if (node.group) capacity[node.group]++;
  }
  const level = input.level;
  const hasProgression = level !== null && input.xp !== null;
  if (!hasProgression) notes.push('Game XP and level were not reported, so XP and level objectives are unavailable.');
  const atCap = level !== null && level >= GAME_LEVEL_CAP;
  if (atCap)
    notes.push('At the level cap, game XP gains are not a verified signal; journey completions are used instead.');
  if (input.nodes.length === 0) notes.push('Journey data was not reported, so journey objectives are unavailable.');
  return {
    tier: level === null ? 'beginner' : tierForLevel(level),
    level,
    xpSignal: hasProgression && !atCap,
    levelSignal: hasProgression && !atCap && level < GAME_LEVEL_CAP,
    capacity,
    notes,
  };
}
