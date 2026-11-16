import { describe, expect, it } from 'vitest';
import {
  categoryOf,
  categoryStats,
  exportCatalog,
  parseCatalog,
  rewardSummary,
} from '../../../src/features/seasons/catalog';
import { definitionSchema, emptyProgress, seasonTemplate } from '../../../src/features/seasons/contracts';

describe('versioned objective catalogs', () => {
  it('round trips content without player state and rejects unsafe envelopes', () => {
    const definition = seasonTemplate();
    expect(parseCatalog(exportCatalog(definition))).toEqual(definition);
    for (const text of ['{}', '{', '{"schemaVersion":2}', '{"__proto__":{}}', ' '.repeat(205000)])
      expect(() => parseCatalog(text)).toThrow();
    expect(() => parseCatalog(JSON.stringify({ schemaVersion: 1, definition, owner: 'another-player' }))).toThrow();
  });
  it('requires bounded, once-only server requirements for API objectives', () => {
    const definition = seasonTemplate();
    const c = definition.challenges[0];
    c.verification = 'character-level';
    c.cadence = 'once';
    c.minimumLevel = 10;
    expect(definitionSchema.safeParse(definition).success).toBe(true);
    c.cadence = 'daily';
    expect(definitionSchema.safeParse(definition).success).toBe(false);
    c.cadence = 'once';
    c.verification = 'journey-node';
    c.journeyNode = 'Journey.Story.Start';
    expect(definitionSchema.safeParse(definition).success).toBe(false);
    delete c.minimumLevel;
    expect(definitionSchema.safeParse(definition).success).toBe(true);
    c.journeyNode = '../node?forged=true';
    expect(definitionSchema.safeParse(definition).success).toBe(false);
  });
  it('preserves historical category fallbacks and counts only this objective period', () => {
    const definition = seasonTemplate(),
      progress = emptyProgress(),
      c = definition.challenges[0];
    expect(categoryOf(c)).toBe('side_quest');
    c.category = 'exploration';
    c.cadence = 'daily';
    c.limit = 2;
    progress.submissions.push({
      id: 'old',
      owner: 'member',
      challengeId: c.id,
      period: '2001-01-01',
      status: 'approved',
      submittedAt: '2001-01-01T00:00:00Z',
      text: 'Old completion',
      links: [],
    });
    const stat = categoryStats(definition, progress, Date.now()).find((s) => s.category === 'exploration');
    expect(stat).toMatchObject({ completed: 0, percent: 0, xp: c.xp * 2 });
    expect(categoryStats(definition, progress, Date.now())).toHaveLength(6);
    expect(rewardSummary(definition, progress)).toMatchObject({ level: 1, claimed: 0, ready: 1 });
  });
});
