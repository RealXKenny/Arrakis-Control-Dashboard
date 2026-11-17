import { describe, expect, it } from 'vitest';
import { MAP_LABELS, resolveMapName } from '../../../src/features/map/maps';

describe('V2 map selection', () => {
  it('defaults to the Hagga Basin and accepts the five known map names', () => {
    expect(resolveMapName(undefined)).toBe('HaggaBasin');
    expect(resolveMapName('DeepDesert')).toBe('DeepDesert');
    expect(resolveMapName(['DeepDesert', 'HaggaBasin'])).toBe('DeepDesert');
    expect(resolveMapName('Arrakeen')).toBe('Arrakeen');
    expect(resolveMapName('HarkoVillage')).toBe('HarkoVillage');
    expect(resolveMapName('Overland')).toBe('HaggaBasin');
    expect(resolveMapName('../etc/passwd')).toBe('HaggaBasin');
    expect(MAP_LABELS.DeepDesert).toBe('Deep Desert');
  });
});
