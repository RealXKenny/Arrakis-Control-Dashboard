import { describe, expect, it } from 'vitest';
import content from '../../../src/features/seasons/content/season-2-template.json';
import { categoryOf, categoryStats, kindCategory, visibleCategories } from '../../../src/features/seasons/catalog';
import {
  definitionSchema,
  emptyProgress,
  objectiveCategories,
  seasonTemplate,
} from '../../../src/features/seasons/contracts';
import { automaticProgressTemplate, generateSeason } from '../../../src/features/seasons/generation';
import { buildAssignment } from '../../../src/features/seasons/engine/assignment';

const settings = { firstNumber: 1, firstStart: '2026-01-01T00:00:00.000Z', timezone: 'UTC' };
const season = () =>
  generateSeason(automaticProgressTemplate(definitionSchema.parse(content.definition)), settings, 1, 0);
const groups = ['story', 'contract', 'codex', 'tutorial'] as const;
const nodes = groups.flatMap((group) =>
  Array.from({ length: 60 }, (_, i) => ({ id: `${group}.todo.${i}`, complete: false, group })),
);

describe('automatic season objective categories', () => {
  it('files every assigned objective kind under the category the game tracks it in', () => {
    expect(kindCategory({ type: 'game-xp', target: 1000 })).toBe('level');
    expect(kindCategory({ type: 'levels', target: 2 })).toBe('level');
    expect(kindCategory({ type: 'journeys', group: 'story', target: 1 })).toBe('story');
    expect(kindCategory({ type: 'journeys', group: 'contract', target: 1 })).toBe('side_quest');
    expect(kindCategory({ type: 'journeys', group: 'codex', target: 1 })).toBe('exploration');
    expect(kindCategory({ type: 'journeys', group: 'tutorial', target: 1 })).toBe('achievement');
    expect(kindCategory({ type: 'journeys', group: 'any', target: 1 })).toBe('achievement');
  });

  it('spreads a generated season across categories once the personal plan exists', () => {
    const definition = season();
    const assignment = buildAssignment({
      definition,
      seasonId: 'season-one',
      owner: '900000000000000001',
      baseline: { at: definition.startsAt, level: 60, xp: '500000', nodes },
    });
    // Without a plan every personalized objective waits in Achievements, exactly what members saw before.
    const before = categoryStats(definition, emptyProgress(), Date.now());
    expect(before.find((s) => s.category === 'achievement')?.challenges).toHaveLength(100);
    const after = categoryStats(definition, emptyProgress(), Date.now(), assignment);
    const used = after.filter((s) => s.challenges.length > 0).map((s) => s.category);
    expect(used).toEqual(expect.arrayContaining(['level', 'story', 'side_quest', 'exploration', 'achievement']));
    expect(after.reduce((sum, s) => sum + s.challenges.length, 0)).toBe(100);
    // Faction reputation is not verified evidence, so it is never assigned and its empty card is hidden.
    expect(after.find((s) => s.category === 'faction')?.challenges).toHaveLength(0);
    expect(visibleCategories(definition, assignment)).not.toContain('faction');
    const assigned = definition.challenges.find((c) => assignment.objectives[c.id]?.type === 'levels');
    expect(assigned && categoryOf(assigned, assignment)).toBe('level');
  });

  it('keeps all six categories for hand-configured seasons', () => {
    const definition = seasonTemplate();
    expect(visibleCategories(definition)).toEqual([...objectiveCategories]);
    expect(visibleCategories(season())).toEqual(['achievement']);
  });
});
