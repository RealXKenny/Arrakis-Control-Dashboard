import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../src/lib/assert-server', () => ({}));
import { applyUpkeepAction } from '../../../src/features/upkeep/server/store';
import { DEFAULT_CHECKLIST, emptyUpkeep, type UpkeepRecord } from '../../../src/features/upkeep/model';

const NOW = '2026-11-26T12:00:00.000Z';
const settings = {
  baseId: '11',
  waterAlertPercent: 25,
  generatorAlertHours: 12,
  inspectEveryDays: 7,
  minimums: [],
  checklist: DEFAULT_CHECKLIST,
};
const id = (n: number) => `8a4b7d73-46d3-4a4e-9c1f-${String(n).padStart(12, '0')}`;
const apply = (record: UpkeepRecord, action: Parameters<typeof applyUpkeepAction>[1]) =>
  applyUpkeepAction(record, action, NOW);

describe('upkeep actions', () => {
  it('keeps inspection history server-timed and bounded when settings change', () => {
    let record = apply(emptyUpkeep(), { action: 'base', revision: null, base: settings });
    for (let index = 0; index < 12; index += 1)
      record = apply(record, {
        action: 'inspect',
        revision: null,
        baseId: '11',
        results: [{ itemId: DEFAULT_CHECKLIST[0].id, status: 'ok', note: `${index}` }],
      });
    record = apply(record, { action: 'base', revision: null, base: { ...settings, waterAlertPercent: 30 } });
    expect(record.bases[0].inspections).toHaveLength(10);
    expect(record.bases[0].inspections.at(-1)).toMatchObject({ at: NOW, results: [{ note: '11' }] });
    expect(record.bases[0].waterAlertPercent).toBe(30);
  });
  it('refuses inspections for unknown checklist items or bases without saved settings', () => {
    expect(() =>
      apply(emptyUpkeep(), {
        action: 'inspect',
        revision: null,
        baseId: '11',
        results: [{ itemId: id(1), status: 'ok', note: '' }],
      }),
    ).toThrow(/Save base upkeep settings/);
    const record = apply(emptyUpkeep(), { action: 'base', revision: null, base: settings });
    expect(() =>
      apply(record, {
        action: 'inspect',
        revision: null,
        baseId: '11',
        results: [{ itemId: id(1), status: 'ok', note: '' }],
      }),
    ).toThrow(/checklist changed/);
  });
  it('records reminder completions without changing other fields and caps history', () => {
    let record = apply(emptyUpkeep(), {
      action: 'reminder',
      revision: null,
      reminder: { id: id(1), title: 'Refuel', baseId: null, everyDays: 2, firstDueAt: NOW, notes: '' },
    });
    for (let index = 0; index < 25; index += 1)
      record = apply(record, { action: 'reminder-complete', revision: null, id: id(1) });
    expect(record.reminders[0].completions).toHaveLength(20);
    expect(record.reminders[0].createdAt).toBe(NOW);
    expect(() => apply(record, { action: 'reminder-complete', revision: null, id: id(2) })).toThrow(/no longer/);
  });
  it('enforces collection limits and replaces container labels in place', () => {
    let record = emptyUpkeep();
    for (let index = 1; index <= 5; index += 1)
      record = apply(record, {
        action: 'relocation',
        revision: null,
        relocation: {
          id: id(index),
          title: 'Move',
          fromBaseId: null,
          destination: '',
          status: 'planning',
          packing: [],
          cargo: [],
          tasks: [],
        },
      });
    expect(() =>
      apply(record, {
        action: 'relocation',
        revision: null,
        relocation: {
          id: id(9),
          title: 'Move',
          fromBaseId: null,
          destination: '',
          status: 'planning',
          packing: [],
          cargo: [],
          tasks: [],
        },
      }),
    ).toThrow(/5 relocation plans/);
    const label = { baseId: '11', containerId: '33', alias: 'Meds', zone: 'Medical' as const };
    record = apply(record, { action: 'container', revision: null, label });
    record = apply(record, { action: 'container', revision: null, label: { ...label, alias: 'Bandages' } });
    expect(record.containers).toEqual([{ ...label, alias: 'Bandages' }]);
    record = apply(record, { action: 'container-remove', revision: null, baseId: '11', containerId: '33' });
    expect(record.containers).toEqual([]);
  });
  it('never mutates the stored record in place', () => {
    const old = apply(emptyUpkeep(), { action: 'base', revision: null, base: settings });
    const snapshot = JSON.stringify(old);
    apply(old, { action: 'base-remove', revision: null, baseId: '11' });
    expect(JSON.stringify(old)).toBe(snapshot);
  });
});
