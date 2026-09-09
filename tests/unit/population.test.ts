import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  DAY_MS,
  summarizePopulation,
  populationSegments,
  totalPlayHours,
} from '../../src/modules/portal/utils/population';
import { recordPopulation, readPopulationHistory } from '../../src/modules/portal/server/population';

const mocks = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  addPopulationSample: vi.fn(),
  readPopulationSamples: vi.fn(),
  request: vi.fn(),
}));
vi.mock('../../src/infrastructure/storage', () => ({ getStateStore: () => mocks }));
vi.mock('../../src/infrastructure/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({
    CONSOLE_URL: 'https://console.test',
    POPULATION_HISTORY_ENABLED: 'true',
    POPULATION_RETENTION_SECONDS: 172800,
    SITE_POLL_INTERVAL_MS: 30000,
    LOG_LEVEL: 'INFO',
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireLease.mockResolvedValue(true);
  mocks.request.mockResolvedValue({ totalCount: 3 });
});

describe('population history', () => {
  it('totals accumulated playtime from every player row', () => {
    expect(
      totalPlayHours({
        rows: [
          { total_playtime_seconds: '22983' },
          { total_playtime_seconds: 3617 },
          { total_playtime_seconds: 'bad' },
        ],
      }),
    ).toBeCloseTo(7.3888889);
    expect(totalPlayHours({ rows: [] })).toBe(0);
    expect(totalPlayHours({ totalCount: 2 })).toBeNull();
  });
  it('computes observed peak and player-hours without filling gaps', () => {
    const now = DAY_MS;
    const result = summarizePopulation(
      [
        { at: now - 600000, online: 100 },
        { at: now - 60000, online: 2 },
        { at: now, online: 4 },
      ],
      now,
    );
    expect(result.peak).toBe(100);
    expect(result.playHours).toBeCloseTo(3 / 60);
    expect(result.coverageHours).toBeCloseTo(1 / 60);
    expect(populationSegments(result).map((s) => s.length)).toEqual([1, 2]);
  });
  it('filters invalid, old and future samples, preserving real zero counts', () => {
    const now = DAY_MS * 2;
    const result = summarizePopulation(
      [
        null,
        { at: 0, online: 5 },
        { at: now + 1, online: 5 },
        { at: now, online: -1 },
        { at: now, online: '4' },
        { at: now - 60000, online: 0 },
        { at: now, online: 0 },
      ],
      now,
    );
    expect(result.points).toHaveLength(2);
    expect(result.peak).toBe(0);
    expect(result.playHours).toBe(0);
    expect(summarizePopulation([], now).peak).toBeNull();
    expect(summarizePopulation([{ at: now, online: 2 }], now).playHours).toBeNull();
  });
  it('claims one sample per minute across replicas and persists bounded aggregates', async () => {
    await recordPopulation();
    expect(mocks.acquireLease).toHaveBeenCalledWith(expect.stringContaining(':sample:'), expect.any(Number));
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/players/online?page=0&pageSize=1');
    expect(mocks.addPopulationSample).toHaveBeenCalledWith(expect.any(String), expect.any(Number), 3, 172800);
    mocks.acquireLease.mockResolvedValue(false);
    await recordPopulation();
    expect(mocks.request).toHaveBeenCalledTimes(1);
  });
  it('does not turn invalid provider responses into zero samples', async () => {
    mocks.request.mockResolvedValue({ rows: [] });
    await recordPopulation();
    expect(mocks.addPopulationSample).not.toHaveBeenCalled();
    mocks.request.mockRejectedValue(new Error('offline'));
    await expect(recordPopulation()).rejects.toThrow('offline');
    expect(mocks.addPopulationSample).not.toHaveBeenCalled();
  });
  it('returns an unavailable reading when Redis fails', async () => {
    mocks.readPopulationSamples.mockRejectedValue(new Error('offline'));
    expect(await readPopulationHistory()).toBeNull();
  });
});
