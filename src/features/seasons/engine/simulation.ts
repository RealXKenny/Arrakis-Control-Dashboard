import { journeyGroups, levelProgress, paths, type Definition } from '../contracts';
import { buildAssignment } from './assignment';
import type { JourneyGroup } from './capability';
import { kindKey } from './kinds';

export type SimulatedProfile = {
  name: string;
  level: number | null;
  xp: string | null;
  /** Journey nodes per group: how many are already complete and how many remain. */
  journeys: Partial<Record<JourneyGroup, { complete: number; incomplete: number }>>;
  /** Fraction of the season that has already elapsed at enrollment (0 = day one). */
  enrolledAt?: number;
};
export type SimulationRow = {
  name: string;
  tier: string;
  level: number | null;
  objectives: number;
  unsupported: number;
  kinds: Record<string, number>;
  /** Highest level each path can reach if every supported objective is completed. */
  reachableLevel: Record<string, number>;
  limitations: string[];
};
export type SimulationReport = {
  rows: SimulationRow[];
  /** Plain-language problems for administrators: impossible objectives, capability gaps, fairness. */
  findings: string[];
};
function nodesOf(profile: SimulatedProfile) {
  return journeyGroups.flatMap((group) => {
    const spec = profile.journeys[group] ?? { complete: 0, incomplete: 0 };
    return [
      ...Array.from({ length: spec.complete }, (_, i) => ({ id: `${group}.done.${i}`, complete: true, group })),
      ...Array.from({ length: spec.incomplete }, (_, i) => ({ id: `${group}.todo.${i}`, complete: false, group })),
    ];
  });
}
/** Runs the real assignment algorithm against synthetic characters. Never touches Redis or the game. */
export function simulateSeason(definition: Definition, profiles: ReadonlyArray<SimulatedProfile>): SimulationReport {
  const start = Date.parse(definition.startsAt),
    end = Date.parse(definition.endsAt);
  const rows: SimulationRow[] = profiles.map((profile) => {
    const assignment = buildAssignment({
      definition,
      seasonId: `sim-${definition.slug}`,
      owner: `sim-${
        profile.name
          .replace(/[^a-z0-9]/gi, '')
          .toLowerCase()
          .slice(0, 40) || 'player'
      }`,
      baseline: {
        at: new Date(start + (end - start) * (profile.enrolledAt ?? 0)).toISOString(),
        level: profile.level,
        xp: profile.xp,
        nodes: nodesOf(profile),
      },
    });
    const kinds: Record<string, number> = {};
    for (const kind of Object.values(assignment.objectives)) kinds[kindKey(kind)] = (kinds[kindKey(kind)] ?? 0) + 1;
    const reachableLevel: Record<string, number> = {};
    for (const path of paths)
      reachableLevel[path] = levelProgress(
        definition,
        definition.challenges
          .filter((c) => c.path === path && (!c.personalized || assignment.objectives[c.id]))
          .reduce((sum, c) => sum + c.xp, 0),
      ).level;
    return {
      name: profile.name,
      tier: assignment.tier,
      level: profile.level,
      objectives: Object.keys(assignment.objectives).length,
      unsupported: assignment.unsupported.length,
      kinds,
      reachableLevel,
      limitations: assignment.limitations,
    };
  });
  const findings: string[] = [];
  for (const row of rows) {
    if (row.unsupported > 0)
      findings.push(
        `${row.name}: ${row.unsupported} objective${row.unsupported === 1 ? '' : 's'} have no verifiable evidence for this character.`,
      );
    if (Math.max(...Object.values(row.reachableLevel)) < definition.thresholds.length)
      findings.push(`${row.name}: no path can reach level ${definition.thresholds.length}.`);
  }
  return { rows, findings };
}
export const REPRESENTATIVE_PROFILES: ReadonlyArray<SimulatedProfile> = [1, 25, 50, 100, 150, 175, 200].map(
  (level) => ({
    name: `Level ${level}`,
    level,
    xp: String(level * 10000),
    journeys: {
      story: { complete: Math.round(level / 4), incomplete: Math.max(0, 40 - Math.round(level / 5)) },
      contract: { complete: Math.round(level / 5), incomplete: Math.max(0, 30 - Math.round(level / 8)) },
      codex: { complete: Math.round(level / 3), incomplete: Math.max(0, 25 - Math.round(level / 10)) },
      tutorial: { complete: level > 1 ? 10 : 0, incomplete: level > 1 ? 0 : 10 },
    },
  }),
);
