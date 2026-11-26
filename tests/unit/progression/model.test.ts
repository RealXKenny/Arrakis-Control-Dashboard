import { describe, expect, it } from 'vitest';
import {
  emptyPlanner,
  goalDraftSchema,
  noteDraftSchema,
  plannerInputSchema,
  plannerRecordSchema,
} from '../../../src/features/progression/model';
import { appendSnapshot, emptyJournal, JOURNAL_LIMIT, recordingDue } from '../../../src/features/progression/journal';
import type { Snapshot } from '../../../src/features/progression/reading';

const id = '00000000-0000-4000-8000-000000000001';
const goal = {
  id,
  kind: 'level',
  title: 'Reach 50',
  ref: '',
  target: '50',
  balance: null,
  pinned: true,
  done: false,
  note: '',
};
const snapshot = (at: string): Snapshot => ({
  at,
  level: '1',
  xp: null,
  credit: null,
  pocket: null,
  factions: null,
  specs: null,
  journey: null,
  bases: null,
  vehicles: null,
});

describe('planner validation', () => {
  it('requires the fields each goal kind needs and keeps completion server-derived', () => {
    expect(goalDraftSchema.safeParse(goal).success).toBe(true);
    expect(goalDraftSchema.safeParse({ ...goal, target: '1.5' }).success).toBe(false);
    expect(goalDraftSchema.safeParse({ ...goal, target: '-1' }).success).toBe(false);
    expect(goalDraftSchema.safeParse({ ...goal, done: true }).success).toBe(false);
    expect(goalDraftSchema.safeParse({ ...goal, kind: 'faction' }).success).toBe(false);
    expect(goalDraftSchema.safeParse({ ...goal, kind: 'solari' }).success).toBe(false);
    expect(
      goalDraftSchema.safeParse({ ...goal, kind: 'solari', balance: 'credit', target: '9'.repeat(30) }).success,
    ).toBe(true);
    expect(goalDraftSchema.safeParse({ ...goal, kind: 'custom', target: '', done: true }).success).toBe(true);
    expect(goalDraftSchema.safeParse({ ...goal, owner: 'someone' }).success).toBe(false);
  });
  it('keeps notebook links inside the dashboard workspace', () => {
    const note = (href: string) =>
      noteDraftSchema.safeParse({ id, title: 'Base', body: '', tags: ['build'], links: [{ label: 'Link', href }] })
        .success;
    expect(note('/holdings?view=owned')).toBe(true);
    expect(note('/bases/abc-123')).toBe(true);
    expect(note('https://example.test')).toBe(false);
    expect(note('//example.test/holdings')).toBe(false);
    expect(note('/holdings/../admin')).toBe(false);
    expect(note('javascript:alert(1)')).toBe(false);
    expect(note('/admin')).toBe(false);
    expect(noteDraftSchema.safeParse({ id, title: 'x', body: '', tags: ['a', 'A'], links: [] }).success).toBe(false);
  });
  it('bounds pinned goals and unique entries in stored records', () => {
    const stamp = { createdAt: '2026-11-20T10:00:00.000Z', updatedAt: '2026-11-20T10:00:00.000Z' };
    const goals = Array.from({ length: 9 }, (_, index) => ({
      ...goal,
      id: `00000000-0000-4000-8000-00000000001${index}`,
      ...stamp,
    }));
    expect(plannerRecordSchema.safeParse({ ...emptyPlanner(), goals: goals.slice(0, 8) }).success).toBe(true);
    expect(plannerRecordSchema.safeParse({ ...emptyPlanner(), goals }).success).toBe(false);
    expect(plannerRecordSchema.safeParse({ ...emptyPlanner(), goals: [goals[0], goals[0]] }).success).toBe(false);
  });
  it('rejects unknown actions and caller ownership fields', () => {
    const base = { revision: null, character: '101' };
    expect(plannerInputSchema.safeParse({ ...base, action: 'save-goal', item: goal }).success).toBe(true);
    expect(plannerInputSchema.safeParse({ ...base, action: 'save-goal', item: goal, owner: 'x' }).success).toBe(false);
    expect(
      plannerInputSchema.safeParse({ ...base, character: 'abc', action: 'set-tracking', enabled: true }).success,
    ).toBe(false);
    expect(plannerInputSchema.safeParse({ ...base, action: 'delete', collection: 'tracking', id }).success).toBe(false);
  });
});

describe('journal policy', () => {
  it('records at most one automatic observation per window and a manual one after 15 minutes', () => {
    const journal = appendSnapshot(emptyJournal(), snapshot('2026-11-20T10:00:00.000Z'));
    expect(journal.startedAt).toBe('2026-11-20T10:00:00.000Z');
    const base = Date.parse('2026-11-20T10:00:00.000Z');
    expect(recordingDue(journal, base + 3600_000, false)).toBe(false);
    expect(recordingDue(journal, base + 6 * 3600_000, false)).toBe(true);
    expect(recordingDue(journal, base + 10 * 60_000, true)).toBe(false);
    expect(recordingDue(journal, base + 15 * 60_000, true)).toBe(true);
  });
  it('drops the oldest observations beyond the bound and ignores out-of-order ones', () => {
    let journal = emptyJournal();
    for (let index = 0; index < JOURNAL_LIMIT + 5; index++)
      journal = appendSnapshot(journal, snapshot(new Date(Date.UTC(2026, 10, 1, index)).toISOString()));
    expect(journal.snapshots).toHaveLength(JOURNAL_LIMIT);
    expect(journal.startedAt).toBe(new Date(Date.UTC(2026, 10, 1, 0)).toISOString());
    expect(appendSnapshot(journal, snapshot('2026-01-01T00:00:00.000Z'))).toBe(journal);
  });
});
