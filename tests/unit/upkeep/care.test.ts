import { describe, expect, it } from 'vitest';
import {
  analyzeWater,
  buildCareInbox,
  compareBlueprints,
  compareMinimums,
  relocationProgress,
  summarizeBlueprint,
  type CareBase,
} from '../../../src/features/upkeep/care';
import {
  emptyUpkeep,
  upkeepActionSchema,
  upkeepRecordSchema,
  type UpkeepRecord,
} from '../../../src/features/upkeep/model';
import { parseLayoutJson } from '../../../src/features/bases/schema';

const NOW = Date.parse('2026-11-26T12:00:00Z');
const base = (patch: Partial<CareBase> = {}): CareBase => ({
  id: '11',
  name: 'Home',
  owned: true,
  water: { percent: 50, text: '500 / 1,000' },
  generatorSeconds: 72 * 3600,
  ...patch,
});
const plan = (patch: Partial<UpkeepRecord['bases'][number]> = {}): UpkeepRecord['bases'][number] => ({
  baseId: '11',
  waterAlertPercent: null,
  generatorAlertHours: null,
  inspectEveryDays: null,
  minimums: [],
  checklist: [],
  inspections: [],
  updatedAt: '2026-11-20T00:00:00.000Z',
  ...patch,
});
const withPlans = (bases: UpkeepRecord['bases'], reminders: UpkeepRecord['reminders'] = []): UpkeepRecord => ({
  ...emptyUpkeep(),
  bases,
  reminders,
});

describe('base-care inbox', () => {
  it('uses the default and user water thresholds without treating unknown readings as healthy', () => {
    expect(buildCareInbox([base({ water: { percent: 9, text: '' } })], emptyUpkeep(), NOW, null)[0]).toMatchObject({
      kind: 'water',
      priority: 'attention',
    });
    expect(buildCareInbox([base()], withPlans([plan({ waterAlertPercent: 60 })]), NOW, null)[0]).toMatchObject({
      kind: 'water',
      priority: 'attention',
      detail: expect.stringContaining('your 60% alert.'),
    });
    expect(buildCareInbox([base({ water: { percent: 0, text: '' } })], emptyUpkeep(), NOW, null)[0].priority).toBe(
      'urgent',
    );
    const unknown = buildCareInbox([base({ water: { percent: null, text: 'No data' } })], emptyUpkeep(), NOW, null);
    expect(unknown).toEqual([expect.objectContaining({ kind: 'unknown', priority: 'unknown' })]);
  });
  it('labels generator projections as estimates and never invents a missing runtime', () => {
    const items = buildCareInbox([base({ generatorSeconds: 3 * 3600 })], emptyUpkeep(), NOW, '2026-11-26T12:00:00Z');
    expect(items[0]).toMatchObject({ kind: 'generator', estimate: true });
    expect(items[0].detail).toContain('2026-11-26 15:00 UTC');
    expect(
      buildCareInbox([base({ generatorSeconds: 3 * 3600 })], withPlans([plan({ generatorAlertHours: 2 })]), NOW, null),
    ).toEqual([]);
    expect(buildCareInbox([base({ generatorSeconds: null })], emptyUpkeep(), NOW, null)[0]).toMatchObject({
      kind: 'unknown',
      title: 'Home: generator runtime not reported',
    });
  });
  it('raises inspections and reminders only when due, and hides reminders for bases no longer visible', () => {
    const inspected = plan({ inspectEveryDays: 7, inspections: [{ at: '2026-11-24T00:00:00.000Z', results: [] }] });
    expect(buildCareInbox([base()], withPlans([inspected]), NOW, null)).toEqual([]);
    expect(buildCareInbox([base()], withPlans([plan({ inspectEveryDays: 1 })]), NOW, null)[0].title).toContain(
      'not yet recorded',
    );
    const reminder = (id: string, baseId: string | null, firstDueAt: string) => ({
      id,
      title: 'Refuel',
      baseId,
      everyDays: 3,
      firstDueAt,
      notes: '',
      completions: [],
      createdAt: '2026-11-01T00:00:00.000Z',
    });
    const items = buildCareInbox(
      [base()],
      withPlans(
        [],
        [
          reminder('8a4b7d73-46d3-4a4e-9c1f-111111111111', '11', '2026-11-26T11:00:00.000Z'),
          reminder('8a4b7d73-46d3-4a4e-9c1f-222222222222', '99', '2026-11-26T11:00:00.000Z'),
          reminder('8a4b7d73-46d3-4a4e-9c1f-333333333333', null, '2026-11-27T11:00:00.000Z'),
          reminder('8a4b7d73-46d3-4a4e-9c1f-444444444444', null, '2026-11-10T11:00:00.000Z'),
        ],
      ),
      NOW,
      null,
    );
    expect(items.map((item) => [item.kind, item.priority])).toEqual([
      ['reminder', 'urgent'],
      ['reminder', 'attention'],
    ]);
  });
});

describe('observed water usage', () => {
  const at = (hours: number) => new Date(NOW + hours * 3_600_000).toISOString();
  it('estimates only from continuous declines and keeps gaps, refills and unknown readings visible', () => {
    const analysis = analyzeWater(
      [
        { t: at(0), percent: 80 },
        { t: at(1), percent: 78 },
        { t: at(2), percent: 76 },
        { t: at(2.5), percent: 90 },
        { t: at(6), percent: 70 },
        { t: at(6.5), percent: null },
        { t: at(7), percent: 69 },
      ],
      10,
    );
    expect(analysis.gaps).toHaveLength(1);
    expect(analysis.refills).toBe(1);
    expect(analysis.unknownSamples).toBe(1);
    expect(analysis.usagePerHour).toBeCloseTo(2);
    expect(analysis.segments.map((segment) => segment.length)).toEqual([4, 1, 1]);
    expect(Date.parse(analysis.projectedThresholdAt!)).toBeCloseTo(Date.parse(at(7 + 59 / 2)), -3);
  });
  it('declines to estimate from less than an hour of continuous evidence', () => {
    const analysis = analyzeWater(
      [
        { t: at(0), percent: 50 },
        { t: at(0.5), percent: 40 },
        { t: at(5), percent: 30 },
      ],
      10,
    );
    expect(analysis.usagePerHour).toBeNull();
    expect(analysis.projectedThresholdAt).toBeNull();
  });
});

describe('stockpile minimums', () => {
  const minimum = { templateId: 'Water', name: 'Water', minimum: '9007199254740995' };
  it('sums exact BigInt quantities and reports a confirmed shortfall only for complete readings', () => {
    const reading = {
      items: [{ templateId: 'water', quantity: '9007199254740993' }],
      sources: [{ status: 'ok' }],
      limited: false,
    } as never;
    expect(compareMinimums([minimum], reading)[0]).toMatchObject({ status: 'below', shortfall: '2' });
    expect(compareMinimums([{ ...minimum, minimum: '1' }], reading)[0]).toMatchObject({
      status: 'met',
      shortfall: null,
    });
  });
  it('never reports a shortfall from partial or unreadable coverage, but can prove a target is met', () => {
    const partial = {
      items: [{ templateId: 'water', quantity: '5' }],
      sources: [{ status: 'unavailable' }],
      limited: false,
    } as never;
    expect(compareMinimums([{ ...minimum, minimum: '10' }], partial)[0]).toMatchObject({
      status: 'unknown',
      observed: '5',
    });
    expect(compareMinimums([{ ...minimum, minimum: '5' }], partial)[0].status).toBe('met');
    const odd = {
      items: [{ templateId: 'water', quantity: 'Unknown' }],
      sources: [{ status: 'ok' }],
      limited: false,
    } as never;
    expect(compareMinimums([{ ...minimum, minimum: '1' }], odd)[0].status).toBe('unknown');
  });
});

describe('blueprint revisions', () => {
  const layout = (extra: number) =>
    parseLayoutJson(
      JSON.stringify({
        base_type: 'Outpost',
        instances: Array.from({ length: 3 + extra }, (_, index) => ({
          instance_id: index + 1,
          building_type: index < 3 ? 'BP_Wall' : 'BP_Floor',
          x: index * 400,
          y: 0,
          z: index * 10,
          rotation: 0,
        })),
      }),
    );
  it('stores bounded counts and a normalised footprint and compares revisions', () => {
    const before = summarizeBlueprint(layout(0));
    const after = summarizeBlueprint(layout(2));
    expect(before).toMatchObject({ pieces: 3, placeables: 0, baseType: 'Outpost', map: 'Not recorded', width: 800 });
    expect(before.footprint.every(([x, y]) => x >= 0 && x <= 1000 && y >= 0 && y <= 1000)).toBe(true);
    expect(compareBlueprints(before, after)).toMatchObject({
      pieces: 2,
      width: 800,
      changes: [{ type: 'BP_Floor', before: 0, after: 2 }],
      partial: false,
    });
  });
});

describe('upkeep schemas', () => {
  it('rejects unknown fields, foreign shapes, unsafe IDs and oversized lists', () => {
    const revision = null;
    expect(upkeepActionSchema.safeParse({ action: 'base-remove', revision, baseId: '11' }).success).toBe(true);
    expect(upkeepActionSchema.safeParse({ action: 'base-remove', revision, baseId: '11', userId: 'x' }).success).toBe(
      false,
    );
    expect(upkeepActionSchema.safeParse({ action: 'base-remove', revision, baseId: '0' }).success).toBe(false);
    expect(
      upkeepActionSchema.safeParse({
        action: 'container',
        revision,
        label: { baseId: '11', containerId: '33', alias: 'Meds', zone: 'Armoury' },
      }).success,
    ).toBe(false);
    const minimums = Array.from({ length: 13 }, (_, index) => ({ templateId: `T${index}`, name: 'x', minimum: '1' }));
    expect(
      upkeepActionSchema.safeParse({
        action: 'base',
        revision,
        base: { ...plan({ minimums }), inspections: undefined, updatedAt: undefined },
      }).success,
    ).toBe(false);
    expect(upkeepRecordSchema.safeParse({ ...emptyUpkeep(), bases: [plan(), plan()] }).success).toBe(false);
  });
  it('tracks relocation progress across every list', () => {
    expect(
      relocationProgress({ packing: [{ done: true }, { done: false }], cargo: [{ done: false }], tasks: [] }),
    ).toEqual({ total: 3, remaining: 2 });
  });
});
