import {
  levelProgress,
  paths,
  type Assignment,
  type Challenge,
  type Definition,
  type ObjectiveKind,
} from '../contracts';
import { analyzeCapability, type Capability, type CapabilityInput } from './capability';
import { candidateKinds, kindKey } from './kinds';
import { seededRandom, weightedPick } from './rng';

const ASSIGNMENT_ALGORITHM = 1;
export type AssignmentHistory = { kindCounts?: Readonly<Record<string, number>> };
/** Relative difficulty (1-20) comes from the published objective's own base target, never from player data. */
function difficultyOf(challenge: Challenge, indexInPath: number) {
  const base = challenge.minimumGameXp ? Math.round(challenge.minimumGameXp / 1000) : indexInPath + 1;
  return Math.max(1, Math.min(20, base));
}
/**
 * Pure, deterministic assignment. Inputs: published definition, owner, immutable baseline snapshot and the enrollment
 * time. The same inputs always produce the same plan, so a refresh or reconnect can never reroll it.
 */
export function buildAssignment(input: {
  definition: Definition;
  seasonId: string;
  owner: string;
  baseline: CapabilityInput & { at: string };
  history?: AssignmentHistory;
}): Assignment {
  const { definition, seasonId, owner, baseline } = input;
  const capability: Capability = analyzeCapability(baseline);
  const start = Date.parse(definition.startsAt),
    end = Date.parse(definition.endsAt),
    enrolled = Math.min(Math.max(Date.parse(baseline.at), start), end);
  const timeFactor = end > start ? (end - enrolled) / (end - start) : 1;
  const seed = `${ASSIGNMENT_ALGORITHM}:${definition.slug}:${seasonId}:${owner}:${capability.tier}:${capability.level ?? 'x'}`;
  const objectives: Record<string, ObjectiveKind> = {};
  const unsupported: string[] = [];
  for (const path of paths) {
    const used: Record<string, number> = {};
    const personal = definition.challenges.filter((c) => c.path === path && c.personalized);
    personal.forEach((challenge, index) => {
      const random = seededRandom(`${seed}:${challenge.id}`);
      const candidates = candidateKinds(capability, difficultyOf(challenge, index), timeFactor);
      const pick = weightedPick(
        candidates.map((c) => {
          const key = kindKey(c.kind);
          const history = input.history?.kindCounts?.[key] ?? 0;
          // Variety within the path, mild repetition penalty across seasons, preference for comfortable headroom.
          return { item: c.kind, weight: (0.5 + c.headroom) / (1 + (used[key] ?? 0)) / (1 + 0.25 * history) };
        }),
        random,
      );
      if (!pick) {
        unsupported.push(challenge.id);
        return;
      }
      used[kindKey(pick)] = (used[kindKey(pick)] ?? 0) + 1;
      objectives[challenge.id] = pick;
    });
  }
  const limitations = [...capability.notes];
  const required = definition.thresholds.at(-1) ?? 0;
  for (const path of paths) {
    const reachable = definition.challenges
      .filter((c) => c.path === path && (!c.personalized || objectives[c.id]))
      .reduce((sum, c) => sum + c.xp, 0);
    if (reachable < required)
      limitations.push(
        `The ${path} path can reach level ${levelProgress(definition, reachable).level} with the objectives your character currently supports. Other paths may offer more.`,
      );
  }
  if (
    Math.max(
      ...paths.map((p) =>
        definition.challenges
          .filter((c) => c.path === p && (!c.personalized || objectives[c.id]))
          .reduce((s, c) => s + c.xp, 0),
      ),
    ) < required
  )
    limitations.push('No path can reach level 100 for this character with the currently supported evidence.');
  return {
    version: 1,
    algorithm: ASSIGNMENT_ALGORITHM,
    seasonId,
    owner,
    at: new Date(enrolled).toISOString(),
    tier: capability.tier,
    level: capability.level,
    objectives,
    unsupported,
    limitations: limitations.slice(0, 20),
  };
}
