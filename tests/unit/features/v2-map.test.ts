import { describe, expect, it } from 'vitest';
import { MAP_LABELS, resolveMapName } from '../../../src/features/map/maps';

describe('V2 map selection', () => {
  it('defaults to the Hagga Basin and accepts only the Deep Desert as an alternative', () => {
    expect(resolveMapName(undefined)).toBe('HaggaBasin');
    expect(resolveMapName('DeepDesert')).toBe('DeepDesert');
    expect(resolveMapName(['DeepDesert', 'HaggaBasin'])).toBe('DeepDesert');
    expect(resolveMapName('../etc/passwd')).toBe('HaggaBasin');
    expect(MAP_LABELS.DeepDesert).toBe('Deep Desert');
  });
});
