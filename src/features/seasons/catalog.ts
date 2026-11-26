// Category navigation/timeline adapted from Icehunter/dune-admin TrackView (MIT, Ryan Wilson, 2026).
// See docs/legal/battle-pass-provenance.md. No upstream game artwork is included.
import { z } from 'zod';
import {
  definitionSchema,
  objectiveCategories,
  levelProgress,
  periodFor,
  type Assignment,
  type Challenge,
  type Definition,
  type ObjectiveKind,
  type Progress,
} from './contracts';

export const categoryLabels: Record<(typeof objectiveCategories)[number], string> = {
  level: 'Levels',
  story: 'Story',
  side_quest: 'Side quests',
  faction: 'Faction',
  exploration: 'Exploration',
  achievement: 'Achievements',
};
export type ObjectiveCategory = (typeof objectiveCategories)[number];
/**
 * Where an automatically assigned objective belongs. The game reports XP, levels and four journey groups; faction
 * reputation is not part of the verified evidence, so no personal objective is ever filed under Faction.
 */
export function kindCategory(kind: ObjectiveKind): ObjectiveCategory {
  if (kind.type === 'game-xp' || kind.type === 'levels') return 'level';
  if (kind.group === 'story') return 'story';
  if (kind.group === 'contract') return 'side_quest';
  if (kind.group === 'codex') return 'exploration';
  return 'achievement';
}
type Plan = Pick<Assignment, 'objectives'> | null | undefined;
export function categoryOf(challenge: Challenge, assignment?: Plan): ObjectiveCategory {
  // Dev note: the plan knows what you are chasing; the template only knew it was something.
  const kind = challenge.personalized ? assignment?.objectives[challenge.id] : undefined;
  if (kind) return kindCategory(kind);
  return (
    challenge.category ??
    (challenge.verification === 'character-level'
      ? 'level'
      : challenge.verification === 'journey-node'
        ? 'story'
        : 'side_quest')
  );
}
export function objectiveStatus(challenge: Challenge, definition: Definition, progress: Progress, now: number) {
  const entries = progress.submissions.filter(
    (s) => s.challengeId === challenge.id && s.period === periodFor(challenge, definition, now),
  );
  if (entries.filter((s) => s.status === 'approved').length >= challenge.limit) return 'completed';
  return entries.some((s) => s.status === 'pending') ? 'pending' : 'available';
}
export function categoryStats(definition: Definition, progress: Progress, now: number, assignment?: Plan) {
  return objectiveCategories.map((category) => {
    const challenges = definition.challenges.filter((c) => categoryOf(c, assignment) === category);
    const completed = challenges.filter((c) => objectiveStatus(c, definition, progress, now) === 'completed').length;
    const pending = challenges.filter((c) => objectiveStatus(c, definition, progress, now) === 'pending').length;
    return {
      category,
      challenges,
      completed,
      pending,
      xp: challenges.reduce((sum, c) => sum + c.xp * c.limit, 0),
      percent: challenges.length ? Math.round((completed / challenges.length) * 100) : 0,
    };
  });
}
/**
 * Categories worth showing. A season of personalized objectives hides categories its plan does not use, so members
 * never see an empty "No objectives configured" card for a season that is generated automatically.
 */
export function visibleCategories(definition: Definition, assignment?: Plan): ObjectiveCategory[] {
  if (!definition.challenges.some((c) => c.personalized)) return [...objectiveCategories];
  const used = new Set(definition.challenges.map((c) => categoryOf(c, assignment)));
  return objectiveCategories.filter((category) => used.has(category));
}
export function rewardSummary(definition: Definition, progress: Progress) {
  const level = levelProgress(definition, progress.xp).level;
  return {
    level,
    ready: definition.rewards.filter((r) => r.level <= level && !progress.claims.some((c) => c.reward.id === r.id))
      .length,
    claimed: progress.claims.length,
    total: definition.rewards.length,
  };
}
export const catalogSchema = z.object({ schemaVersion: z.literal(1), definition: definitionSchema }).strict();
export const MAX_CATALOG_BYTES = 200 * 1024;
function rejectKeys(value: unknown, depth = 0) {
  if (depth > 16) throw new Error('Catalog nesting exceeds the limit.');
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Invalid catalog field.');
    rejectKeys(child, depth + 1);
  }
}
export function parseCatalog(text: string): Definition {
  if (new TextEncoder().encode(text).byteLength > MAX_CATALOG_BYTES) throw new Error('Catalog exceeds 200 KiB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Choose a valid season catalog JSON file.');
  }
  rejectKeys(value);
  const parsed = catalogSchema.safeParse(value);
  if (!parsed.success) throw new Error('Catalog does not match the season definition schema.');
  return parsed.data.definition;
}
export function exportCatalog(definition: Definition): string {
  const text = JSON.stringify({ schemaVersion: 1, definition: definitionSchema.parse(definition) }, null, 2);
  parseCatalog(text);
  return text;
}
