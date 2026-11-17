import { describe, expect, it } from 'vitest';
import content from '../../../src/features/seasons/content/season-2-template.json';
import { assignmentSchema, definitionSchema, paths } from '../../../src/features/seasons/contracts';
import { automaticProgressTemplate, generateSeason } from '../../../src/features/seasons/generation';
import { analyzeCapability, GAME_LEVEL_CAP, tierForLevel } from '../../../src/features/seasons/engine/capability';
import { buildAssignment } from '../../../src/features/seasons/engine/assignment';
import { candidateKinds, satisfied, type Measurement } from '../../../src/features/seasons/engine/kinds';
import { seededRandom } from '../../../src/features/seasons/engine/rng';
import { THEMES, themeForSeason } from '../../../src/features/seasons/engine/themes';
import { REPRESENTATIVE_PROFILES, simulateSeason } from '../../../src/features/seasons/engine/simulation';

const settings = { firstNumber: 1, firstStart: '2026-01-01T00:00:00.000Z', timezone: 'UTC' };
const season = (number = 1) =>
  generateSeason(automaticProgressTemplate(definitionSchema.parse(content.definition)), settings, number, number - 1);
const nodes = (todo: number, done = 5) => [
  ...Array.from({ length: done }, (_, i) => ({ id: `s.done.${i}`, complete: true, group: 'story' as const })),
  ...Array.from({ length: todo }, (_, i) => ({ id: `s.todo.${i}`, complete: false, group: 'story' as const })),
];

describe('capability analysis', () => {
  it('maps characters to the documented tiers', () => {
    expect([1, 49, 50, 99, 100, 149, 150, 199, 200].map(tierForLevel)).toEqual([
      'beginner',
      'beginner',
      'intermediate',
      'intermediate',
      'advanced',
      'advanced',
      'veteran',
      'veteran',
      'endgame',
    ]);
  });
  it('treats incomplete nodes as capacity and refuses XP signals at the cap or without data', () => {
    const capped = analyzeCapability({ level: GAME_LEVEL_CAP, xp: '1', nodes: nodes(7) });
    expect(capped.xpSignal).toBe(false);
    expect(capped.capacity.any).toBe(7);
    expect(capped.notes.join(' ')).toContain('level cap');
    const blind = analyzeCapability({ level: null, xp: null, nodes: [] });
    expect(blind.xpSignal).toBe(false);
    expect(blind.notes).toHaveLength(2);
  });
});
describe('objective kinds', () => {
  it('never offers more journeys than remain incomplete, nor levels beyond the cap', () => {
    const cap = analyzeCapability({ level: 199, xp: '5', nodes: nodes(3) });
    for (let d = 1; d <= 20; d++)
      for (const { kind } of candidateKinds(cap, d, 1)) {
        if (kind.type === 'journeys') expect(kind.target).toBeLessThanOrEqual(cap.capacity[kind.group]);
        if (kind.type === 'levels') expect(199 + kind.target).toBeLessThanOrEqual(GAME_LEVEL_CAP);
      }
  });
  it('measures only supported evidence', () => {
    const m: Measurement = {
      gainedXp: 1000n,
      levelsGained: 1,
      earned: { any: 2, story: 2, contract: 0, codex: 0, tutorial: 0 },
    };
    expect(satisfied({ type: 'game-xp', target: 1000 }, m)).toBe(true);
    expect(satisfied({ type: 'levels', target: 2 }, m)).toBe(false);
    expect(satisfied({ type: 'journeys', group: 'contract', target: 1 }, m)).toBe(false);
  });
  it('produces reproducible seeded sequences', () => {
    const a = seededRandom('x'),
      b = seededRandom('x');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
describe('personalized assignment', () => {
  const base = {
    definition: season(),
    seasonId: 'season-one',
    owner: 'member',
    baseline: { at: '2026-01-01T00:00:00.000Z', level: 60, xp: '600000', nodes: nodes(30) },
  };
  it('is deterministic, schema-valid and stable across calls (no rerolling)', () => {
    const one = buildAssignment(base),
      two = buildAssignment(structuredClone(base));
    expect(two).toEqual(one);
    expect(assignmentSchema.safeParse(one).success).toBe(true);
    expect(Object.keys(one.objectives).length + one.unsupported.length).toBe(100);
  });
  it('differs between owners and between capability profiles', () => {
    const one = buildAssignment(base);
    expect(buildAssignment({ ...base, owner: 'other' }).objectives).not.toEqual(one.objectives);
    expect(buildAssignment({ ...base, baseline: { ...base.baseline, level: 190, nodes: nodes(30) } }).tier).toBe(
      'veteran',
    );
  });
  it('gives level-200 characters only journey objectives they can still complete', () => {
    const plan = buildAssignment({ ...base, baseline: { ...base.baseline, level: 200, nodes: nodes(12) } });
    expect(plan.tier).toBe('endgame');
    for (const kind of Object.values(plan.objectives)) {
      expect(kind.type).toBe('journeys');
      if (kind.type === 'journeys') expect(kind.target).toBeLessThanOrEqual(12);
    }
    expect(plan.unsupported.length).toBeGreaterThan(0);
    expect(plan.limitations.join(' ')).toContain('level 100');
  });
  it('reports a limitation instead of promising progress when no evidence is supported', () => {
    const plan = buildAssignment({ ...base, baseline: { ...base.baseline, level: null, xp: null, nodes: [] } });
    expect(Object.keys(plan.objectives)).toHaveLength(0);
    expect(plan.unsupported).toHaveLength(100);
    expect(plan.limitations.join(' ')).toContain('No path can reach level 100');
  });
  it('scales late enrollment down within bounds without touching XP', () => {
    const early = buildAssignment(base),
      late = buildAssignment({ ...base, baseline: { ...base.baseline, at: '2026-03-15T00:00:00.000Z' } });
    const total = (p: typeof early) =>
      Object.values(p.objectives).reduce((sum, k) => sum + (k.type === 'levels' ? 0 : k.target), 0);
    expect(total(late)).toBeLessThanOrEqual(total(early));
    expect(season().challenges.reduce((s, c) => s + c.xp, 0)).toBe(250000);
  });
});
describe('seasonal identity', () => {
  it('never repeats a theme within eight seasons or back to back across cycles', () => {
    for (let start = 1; start <= 33; start += 8)
      expect(new Set(Array.from({ length: 8 }, (_, i) => themeForSeason(start + i).id)).size).toBe(8);
    for (let n = 1; n < 80; n++) expect(themeForSeason(n + 1).id).not.toBe(themeForSeason(n).id);
    expect(THEMES).toHaveLength(8);
  });
  it('themes generated seasons deterministically while preserving the XP invariants', () => {
    const a = season(3),
      b = season(3);
    expect(a).toEqual(b);
    expect(a.subtitle).toBe(themeForSeason(3).subtitle);
    expect(season(3).subtitle).not.toBe(season(4).subtitle);
    for (const path of paths)
      expect(a.challenges.filter((c) => c.path === path).reduce((s, c) => s + c.xp, 0)).toBe(50000);
    expect(a.challenges.every((c) => c.personalized)).toBe(true);
  });
});
describe('representative simulation', () => {
  it('assigns a coherent plan for every tier and reports every limitation honestly', () => {
    const report = simulateSeason(season(), REPRESENTATIVE_PROFILES);
    expect(report.rows.map((r) => r.level)).toEqual([1, 25, 50, 100, 150, 175, 200]);
    for (const row of report.rows) {
      expect(row.objectives + row.unsupported).toBe(100);
      if (row.level === 200) expect(Object.keys(row.kinds).every((k) => k.startsWith('journeys'))).toBe(true);
    }
    expect(report.rows[0].tier).toBe('beginner');
    expect(report.rows.at(-1)!.tier).toBe('endgame');
    expect(report.findings).toBeInstanceOf(Array);
  });
});
