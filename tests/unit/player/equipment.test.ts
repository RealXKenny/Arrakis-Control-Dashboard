import { describe, expect, it } from 'vitest';
import {
  compareGear,
  durabilityReading,
  loadoutReadiness,
  matchesFilter,
  plannerRecordSchema,
  resupplyChecklist,
  snapshotChanges,
  storageSuggestions,
  summarizeSnapshot,
  wearReadings,
  defaultGearFilter,
  emptyPlanner,
  type Coverage,
  type ContainerReading,
  type Loadout,
  type ObservedItem,
  type SavedFilter,
} from '../../../src/features/player/equipment';

const now = '2026-11-26T02:00:00.000Z';
const ok: Coverage = {
  startedAt: now,
  limited: false,
  sources: [{ name: 'Character inventory', status: 'ok', detail: '', checkedAt: now }],
};
const partial: Coverage = { ...ok, sources: [{ ...ok.sources[0], status: 'unavailable' }] };
let counter = 0;
const item = (patch: Partial<ObservedItem> = {}): ObservedItem => ({
  id: String(++counter),
  name: 'Cutteray',
  templateId: 'Cutteray_T3',
  quantity: '1',
  grade: '3',
  durability: '80 / 100',
  augments: [],
  location: 'Character · Backpack · inventory 1 · slot 0',
  href: '/storage',
  sourceKind: 'character',
  container: 'Character',
  containerKey: 'character',
  group: 'Backpack',
  ...patch,
});
const loadout = (items: Loadout['items']): Loadout => ({
  id: '0b1d8f43-0d8f-4b3c-9e47-6f3c1a2b9d10',
  name: 'Spice run',
  purpose: 'harvesting',
  notes: '',
  items,
});
const need = (patch: Partial<Loadout['items'][number]> = {}) => ({
  templateId: 'Cutteray_T3',
  name: 'Cutteray',
  quantity: '1',
  minGrade: null,
  minDurabilityPercent: null,
  ...patch,
});

describe('N003 saved loadouts', () => {
  it('accepts bounded private loadouts for the four purposes and rejects unsafe shapes', () => {
    const planner = { ...emptyPlanner(), loadouts: [loadout([need()])] };
    expect(plannerRecordSchema.safeParse({ revision: null, planner }).success).toBe(true);
    for (const bad of [
      { ...planner, loadouts: [{ ...loadout([need()]), purpose: 'raiding' }] },
      { ...planner, loadouts: [loadout([need(), need({ templateId: 'cutteray_t3' })])] },
      { ...planner, loadouts: [loadout([need({ quantity: '0' })])] },
      { ...planner, loadouts: [loadout([need({ quantity: '1.5' })])] },
      { ...planner, loadouts: [loadout([need({ minDurabilityPercent: 101 })])] },
      { ...planner, loadouts: [loadout([])] },
      { ...planner, loadouts: Array.from({ length: 9 }, () => loadout([need()])) },
      { ...planner, ownerId: 'foreign' },
    ])
      expect(plannerRecordSchema.safeParse({ revision: null, planner: bad }).success).toBe(false);
  });
});

describe('N004 readiness and N007 resupply', () => {
  it('is ready only when suitable observed quantities cover the requirement', () => {
    const result = loadoutReadiness(loadout([need({ quantity: '2', minGrade: 3 })]), [item(), item()], ok);
    expect(result.ready).toBe(true);
    expect(result.entries[0]).toMatchObject({ status: 'ready', suitable: '2', shortfall: '0' });
    expect(resupplyChecklist(result)).toEqual([]);
  });
  it('separates missing from unsuitable gear with complete coverage', () => {
    const missing = loadoutReadiness(loadout([need({ quantity: '3' })]), [item()], ok);
    expect(missing.entries[0]).toMatchObject({ status: 'missing', shortfall: '2' });
    expect(resupplyChecklist(missing)[0]).toMatchObject({ certain: true, text: expect.stringContaining('Get 2') });
    const worn = loadoutReadiness(
      loadout([need({ minDurabilityPercent: 90 })]),
      [item({ durability: '50 / 100' })],
      ok,
    );
    expect(worn.entries[0]).toMatchObject({ status: 'unsuitable', unsuitable: '1' });
    expect(worn.entries[0].reasons).toContain('Durability below 90%.');
    expect(resupplyChecklist(worn)[0].text).toContain('Repair, upgrade or replace');
  });
  it('never claims missing gear when coverage, grade, durability or quantity is unknown', () => {
    expect(loadoutReadiness(loadout([need()]), [], partial).entries[0].status).toBe('unconfirmed');
    expect(
      loadoutReadiness(loadout([need({ minGrade: 2 })]), [item({ grade: 'Unknown' })], ok).entries[0],
    ).toMatchObject({ status: 'unconfirmed', unverified: '1' });
    expect(
      loadoutReadiness(loadout([need({ minDurabilityPercent: 10 })]), [item({ durability: 'Unknown / Unknown' })], ok)
        .entries[0].status,
    ).toBe('unconfirmed');
    expect(loadoutReadiness(loadout([need()]), [item({ quantity: 'Unknown' })], ok).entries[0].status).toBe(
      'unconfirmed',
    );
    const step = resupplyChecklist(loadoutReadiness(loadout([need()]), [], partial))[0];
    expect(step).toMatchObject({ certain: false, text: expect.stringContaining('up to 1') });
  });
  it('counts large quantities exactly and accepts a sufficient lower bound from partial coverage', () => {
    const result = loadoutReadiness(
      loadout([need({ quantity: '5' })]),
      [item({ quantity: '9007199254740993' })],
      partial,
    );
    expect(result.entries[0]).toMatchObject({ status: 'ready', suitable: '9007199254740993' });
  });
});

describe('N005 gear comparison', () => {
  it('highlights only the best known values and leaves unknowns unranked', () => {
    const rows = compareGear([
      item({ grade: '2', durability: '40 / 100' }),
      item({ grade: '5', durability: 'Unknown / Unknown' }),
      item({ grade: 'Unknown', durability: '90 / 120', augments: ['Harvest (grade 2)'] }),
    ]);
    const grade = rows.find((row) => row.label === 'Grade')!;
    expect(grade).toMatchObject({ values: ['2', '5', 'Unknown'], best: [1], unknown: [2] });
    const durability = rows.find((row) => row.label === 'Durability')!;
    expect(durability.best).toEqual([2]);
    expect(durability.values[1]).toBe('Unknown');
    expect(rows.find((row) => row.label === 'Augments')).toMatchObject({ best: [], values: expect.any(Array) });
  });
  it('does not highlight a single known value or ties and caps the selection', () => {
    expect(compareGear([item({ grade: '3' }), item({ grade: 'Unknown' })])[0].best).toEqual([]);
    expect(compareGear([item(), item()])[0].best).toEqual([]);
    expect(compareGear(Array.from({ length: 6 }, () => item()))[0].values).toHaveLength(4);
  });
  it('rejects inconsistent durability readings', () => {
    expect(durabilityReading('120 / 100')).toBeNull();
    expect(durabilityReading('5 / 0')).toBeNull();
    expect(durabilityReading('Unknown / 100')).toBeNull();
    expect(durabilityReading('25 / 100')).toEqual({ current: 25, max: 100, percent: 25 });
  });
});

describe('N006 wear watchlist', () => {
  it('flags stacks below the member threshold and keeps unknown readings explicit', () => {
    const [reading] = wearReadings(
      [{ templateId: 'Cutteray_T3', name: 'Cutteray', thresholdPercent: 50 }],
      [item({ durability: '90 / 100' }), item({ durability: '10 / 100' }), item({ durability: 'Unknown / 100' })],
    );
    expect(reading).toMatchObject({ below: 1, unknown: 1, limited: false });
    expect(reading.stacks.map((stack) => stack.status)).toEqual(['below', 'unknown', 'ok']);
  });
  it('bounds readings per watched item', () => {
    const [reading] = wearReadings(
      [{ templateId: 'Cutteray_T3', name: 'Cutteray', thresholdPercent: 50 }],
      Array.from({ length: 25 }, () => item()),
    );
    expect(reading.stacks).toHaveLength(20);
    expect(reading.limited).toBe(true);
  });
});

describe('N009 reusable filters', () => {
  const filter = (patch: Partial<SavedFilter>): SavedFilter => ({ ...defaultGearFilter(), kind: 'any', ...patch });
  it('matches grade, category, augments and container location', () => {
    const gear = item({ group: 'Character gear', augments: ['Harvest (grade 2)'] });
    const cargo = item({ sourceKind: 'vehicle', location: 'Vehicle Scout #22 · inventory 5 · slot 1', group: null });
    expect(matchesFilter(filter({ minGrade: 3, maxGrade: 4 }), gear)).toBe(true);
    expect(matchesFilter(filter({ minGrade: 4 }), gear)).toBe(false);
    expect(matchesFilter(filter({ kind: 'equipped' }), gear)).toBe(true);
    expect(matchesFilter(filter({ kind: 'equipped' }), cargo)).toBe(false);
    expect(matchesFilter(filter({ augments: 'with', augmentText: 'harvest' }), gear)).toBe(true);
    expect(matchesFilter(filter({ augments: 'without' }), gear)).toBe(false);
    expect(matchesFilter(filter({ source: 'vehicle', locationText: 'scout' }), cargo)).toBe(true);
    expect(matchesFilter(filter({ source: 'base' }), cargo)).toBe(false);
    expect(matchesFilter(filter({ kind: 'supplies' }), item({ durability: 'Unknown / Unknown' }))).toBe(true);
  });
  it('never lets an unknown grade satisfy a grade bound', () => {
    expect(matchesFilter(filter({ maxGrade: 5 }), item({ grade: 'Unknown' }))).toBe(false);
  });
  it('rejects inverted grade ranges', () => {
    const planner = { ...emptyPlanner(), filters: [filter({ name: 'Bad', minGrade: 5, maxGrade: 2 })] };
    expect(plannerRecordSchema.safeParse({ revision: null, planner }).success).toBe(false);
  });
});

describe('N010 storage suggestions', () => {
  const container = (patch: Partial<ContainerReading>): ContainerReading => ({
    key: 'base:11:33',
    label: 'Medical Locker',
    location: 'Base Home #11 · Medical Locker #33',
    href: '/holdings?view=owned#base-11',
    sourceKind: 'base',
    usedSlots: 4,
    maxSlots: 10,
    ...patch,
  });
  const rule = { id: '6f9c1a6e-2a0b-4a1f-9f7e-8a6d3b2c1e0f', containerLabel: 'medical', itemText: 'healkit' };
  const healkit = item({ name: 'Healkit', templateId: 'Healkit_T1', durability: 'Unknown / Unknown' });
  it('suggests only label-matched containers with verified free slots', () => {
    const [suggestion] = storageSuggestions(
      [rule],
      [healkit],
      [
        container({}),
        container({ key: 'base:11:34', label: 'Medical Overflow', maxSlots: null }),
        container({ key: 'base:11:35', label: 'Medical Full', usedSlots: 10 }),
        container({ key: 'base:11:36', label: 'Fuel' }),
      ],
    );
    expect(suggestion.destinations).toHaveLength(1);
    expect(suggestion.destinations[0]).toMatchObject({ label: 'Medical Locker', freeSlots: 6 });
    expect(suggestion.unverified).toEqual([expect.objectContaining({ label: 'Medical Overflow' })]);
  });
  it('ignores items outside the backpack and items without a matching rule', () => {
    expect(storageSuggestions([rule], [item()], [container({})])).toEqual([]);
    expect(storageSuggestions([rule], [{ ...healkit, sourceKind: 'base', group: null }], [container({})])).toEqual([]);
  });
});

describe('N008 observed change history', () => {
  const observation = (items: ObservedItem[], coverage: Coverage = ok) => ({ ...coverage, items, containers: [] });
  it('stores only exact per-template totals without locations', () => {
    const snapshot = summarizeSnapshot(
      observation([item({ quantity: '9007199254740993' }), item({ quantity: '7' })]),
      '4c2e9a5b-8d3f-4e1a-9b7c-6d5e4f3a2b1c',
      now,
    );
    expect(snapshot.totals).toEqual([
      { templateId: 'Cutteray_T3', name: 'Cutteray', quantity: '9007199254741000', exact: true },
    ]);
    expect(JSON.stringify(snapshot)).not.toContain('slot');
  });
  it('labels changes uncertain when either snapshot had partial coverage or unknown quantities', () => {
    const id = '4c2e9a5b-8d3f-4e1a-9b7c-6d5e4f3a2b1c';
    const before = summarizeSnapshot(observation([item({ quantity: '5' })]), id, now);
    const after = summarizeSnapshot(observation([item({ quantity: '2' })]), id, now);
    expect(snapshotChanges(before, after)).toEqual([expect.objectContaining({ delta: '-3', certain: true })]);
    const gap = summarizeSnapshot(observation([], partial), id, now);
    expect(snapshotChanges(before, gap)).toEqual([expect.objectContaining({ delta: '-5', certain: false })]);
    const unknown = summarizeSnapshot(observation([item({ quantity: 'Unknown' })]), id, now);
    expect(snapshotChanges(before, unknown)[0].certain).toBe(false);
  });
  it('omits unchanged templates and marks truncated absences uncertain', () => {
    const id = '4c2e9a5b-8d3f-4e1a-9b7c-6d5e4f3a2b1c';
    const before = summarizeSnapshot(observation([item()]), id, now);
    expect(snapshotChanges(before, before)).toEqual([]);
    const many = summarizeSnapshot(
      observation(
        Array.from({ length: 160 }, (_, index) => item({ templateId: `A_${String(index).padStart(3, '0')}` })),
      ),
      id,
      now,
    );
    expect(many.truncated).toBe(true);
    expect(many.totals).toHaveLength(150);
    expect(snapshotChanges(before, many).find((change) => change.templateId === 'Cutteray_T3')?.certain).toBe(false);
  });
});
