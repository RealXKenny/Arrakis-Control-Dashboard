import { describe, expect, it } from 'vitest';
import { formatCoriolisCountdown, normalizeCoriolisCycleAt } from '../../src/modules/map/utils/coriolis';

describe('Coriolis countdown', () => {
  it('formats a second-accurate countdown with stable clock columns', () => {
    const now = Date.parse('2026-09-20T08:58:59Z');
    expect(formatCoriolisCountdown('2026-09-22T10:00:00Z', now)).toBe('2d 01:01:01');
  });

  it('reports missing and elapsed provider timestamps safely', () => {
    expect(formatCoriolisCountdown(null, 0)).toBe('Not reported');
    expect(formatCoriolisCountdown('invalid', 0)).toBe('Not reported');
    expect(formatCoriolisCountdown('2026-09-20T10:00:00Z', Date.parse('2026-09-20T10:00:01Z'))).toBe('Cycle updating…');
  });

  it('normalizes valid provider dates before exposing them through the map API', () => {
    expect(normalizeCoriolisCycleAt('2026-09-22T10:00:00Z')).toBe('2026-09-22T10:00:00.000Z');
    expect(normalizeCoriolisCycleAt('tomorrow-ish')).toBeNull();
  });
});
