import { describe, expect, it } from 'vitest';
import {
  buildBriefing,
  compareBuild,
  compareSnapshots,
  exactInteger,
  factionSeries,
  goalProgress,
  journalEntries,
  readingFromProfile,
  schematicObserved,
  snapshotOf,
  type Reading,
  type Snapshot,
} from '../../../src/features/progression/reading';
import { emptyPlanner, type StoredGoal } from '../../../src/features/progression/model';

const at = '2026-11-20T10:00:00.000Z';
const stamp = { createdAt: at, updatedAt: at };
const profile = (details: Record<string, unknown>) => ({
  details,
  bases: [{ id: 'b1', name: 'Stronghold' }],
  vehicles: [{ id: 'v1', name: 'Sandbike' }],
  character: {},
});
const fullDetails = {
  progression: { level: 42, xp: '9007199254740993', unspentSkillPoints: 3 },
  currency: {
    rows: [
      { currency_id: 0, balance: '123456789012345678901', label: 'Solari Credit' },
      { currency_id: 1, balance: '5', label: 'House Credit' },
    ],
  },
  'solaris-coin': { total: 250 },
  factions: {
    rows: [
      { faction_name: 'Atreides', reputation_amount: 1200 },
      { faction_name: 'Harkonnen', reputation_amount: 1.5 },
    ],
  },
  specs: { rows: [{ track_name: 'Trooper', level: 4 }] },
  journey: {
    rows: {
      story: [
        { id: 's1', complete: true },
        { id: 's2', complete: false },
      ],
      codex: [],
      contract: [],
      tutorial: [],
    },
  },
  inventory: {
    rows: [
      { display_name: 'Cutteray Mk2', inventory_type: 30 },
      { display_name: 'Water', inventory_type: 0 },
    ],
  },
  bases: { rows: [] },
  vehicles: { rows: [] },
};
const reading = readingFromProfile(profile(fullDetails) as never, at);
const goal = (patch: Partial<StoredGoal>): StoredGoal => ({
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'level',
  title: 'Goal',
  ref: '',
  target: '50',
  balance: null,
  pinned: false,
  done: false,
  note: '',
  ...stamp,
  ...patch,
});

describe('progression readings', () => {
  it('keeps exact decimal strings and turns fractional or missing values into unknowns', () => {
    expect(reading).toMatchObject({
      level: '42',
      xp: '9007199254740993',
      credit: '123456789012345678901',
      pocket: '250',
      unspentSkillPoints: '3',
      journey: { story: 1, codex: 0, contract: 0, tutorial: 0 },
      schematics: ['Cutteray Mk2'],
    });
    expect(reading.factions).toEqual([
      { name: 'Atreides', value: '1200' },
      { name: 'Harkonnen', value: null },
    ]);
    expect(exactInteger('1e3')).toBeNull();
    expect(exactInteger(-5)).toBe('-5');
    const empty = readingFromProfile(profile({ progression: null, factions: { supported: false } }) as never, at);
    expect(empty).toMatchObject({ level: null, factions: null, specs: null, journey: null, bases: null, credit: null });
  });
  it('bounds journey nodes and flags a limited reading', () => {
    const story = Array.from({ length: 1200 }, (_, index) => ({ id: `n${index}`, complete: false }));
    const big = readingFromProfile(profile({ journey: { rows: { story } } }) as never, at);
    expect(big.journeyNodes).toHaveLength(1000);
    expect(big.journeyLimited).toBe(true);
  });
});

describe('goal progress', () => {
  it('derives completion from readings and never from caller input', () => {
    expect(goalProgress(goal({ target: '40' }), reading)).toMatchObject({
      state: 'met',
      current: '42',
      remaining: '0',
    });
    expect(goalProgress(goal({ target: '50' }), reading)).toMatchObject({ state: 'open', remaining: '8' });
    expect(goalProgress(goal({ kind: 'faction', ref: 'atreides', target: '2000' }), reading)).toMatchObject({
      state: 'open',
      remaining: '800',
    });
    expect(goalProgress(goal({ kind: 'faction', ref: 'Harkonnen', target: '1' }), reading).state).toBe('unknown');
    expect(goalProgress(goal({ kind: 'faction', ref: 'Fremen', target: '1' }), reading).state).toBe('unknown');
    expect(goalProgress(goal({ kind: 'journey', ref: 's1', target: '' }), reading).state).toBe('met');
    expect(goalProgress(goal({ kind: 'journey', ref: 's2', target: '' }), reading).state).toBe('open');
    expect(goalProgress(goal({ kind: 'custom', target: '', done: true }), null).state).toBe('met');
    expect(goalProgress(goal({}), null).state).toBe('unknown');
  });
  it('compares Solari savings exactly against the chosen read-only balance', () => {
    const credit = goal({ kind: 'solari', balance: 'credit', target: '123456789012345678902' });
    expect(goalProgress(credit, reading)).toMatchObject({ state: 'open', remaining: '1' });
    expect(goalProgress({ ...credit, balance: 'pocket', target: '200' }, reading).state).toBe('met');
    expect(goalProgress(credit, { ...reading, credit: null }).state).toBe('unknown');
  });
});

describe('skill builds and recipes', () => {
  it('compares planned levels with verified ranks and keeps unreported tracks unknown', () => {
    expect(
      compareBuild(
        {
          targets: [
            { track: 'trooper', level: 6 },
            { track: 'Mentat', level: 2 },
          ],
        },
        reading,
      ),
    ).toEqual([
      { track: 'trooper', planned: 6, current: '4', gap: '2' },
      { track: 'Mentat', planned: 2, current: null, gap: null },
    ]);
  });
  it('reports schematics as an observation only', () => {
    expect(schematicObserved('cutteray mk2', reading)).toBe(true);
    expect(schematicObserved('Water', reading)).toBe(false);
    expect(schematicObserved('Any', { ...reading, schematics: null })).toBeNull();
  });
});

describe('journal and briefing', () => {
  const first = snapshotOf(reading);
  const second: Snapshot = {
    ...first,
    at: '2026-11-21T10:00:00.000Z',
    level: '43',
    factions: [
      { name: 'Atreides', value: '1500' },
      { name: 'Harkonnen', value: null },
    ],
    journey: { story: 2, codex: 0, contract: 0, tutorial: 0 },
    bases: [{ id: 'b2', name: 'Outpost' }],
    credit: null,
  };
  it('describes only observed changes and lists unobserved readings', () => {
    const entry = compareSnapshots(first, second);
    expect(entry.changes).toEqual(
      expect.arrayContaining([
        { label: 'Level', from: '42', to: '43', delta: '1' },
        { label: 'Faction: Atreides', from: '1200', to: '1500', delta: '300' },
        { label: 'Journey story objectives complete', from: '1', to: '2', delta: '1' },
        { label: 'Base added: Outpost', from: null, to: null, delta: null },
        { label: 'Base removed: Stronghold', from: null, to: null, delta: null },
      ]),
    );
    expect(entry.unobserved).toEqual(expect.arrayContaining(['Solari credit', 'Faction: Harkonnen']));
    expect(journalEntries([first])).toEqual([]);
    expect(journalEntries([first, second])).toHaveLength(1);
  });
  it('never claims removal from a full bounded asset list', () => {
    const many = Array.from({ length: 25 }, (_, index) => ({ id: `b${index}`, name: `Base ${index}` }));
    const entry = compareSnapshots({ ...first, bases: many }, { ...first, at: second.at, bases: many.slice(1) });
    expect(entry.changes.some((change) => change.label.startsWith('Base removed'))).toBe(false);
  });
  it('builds a bounded faction series with explicit unknowns', () => {
    expect(factionSeries([first, { ...second, factions: null }], 'Atreides')).toEqual([
      { at: first.at, value: '1200' },
      { at: second.at, value: null },
    ]);
  });
  it('summarizes outstanding goals and open checklist items', () => {
    const planner = {
      ...emptyPlanner(),
      goals: [
        goal({ target: '40', title: 'Done' }),
        goal({ id: '00000000-0000-4000-8000-000000000002', title: 'Open' }),
      ],
      checklist: [{ id: '00000000-0000-4000-8000-000000000003', text: 'Refuel', done: false, ...stamp }],
    };
    const briefing = buildBriefing(planner, reading as Reading, null);
    expect(briefing.outstandingGoals.map((entry) => entry.title)).toEqual(['Open']);
    expect(briefing.openChecklist).toBe(1);
    expect(briefing.changes).toBeNull();
    expect(
      buildBriefing(planner, reading, { ...first, at: '2026-11-19T10:00:00.000Z', level: '41' }).changes?.changes[0],
    ).toMatchObject({
      label: 'Level',
      delta: '1',
    });
  });
});
