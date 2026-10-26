import { describe, expect, it, vi } from 'vitest';
import {
  getDashboardSnapshot,
  isMapId,
  MockDashboardDataProvider,
  parseMapParam,
  ProviderBusyError,
  ProviderRateLimitedError,
  ProviderReadError,
  RedisDashboardDataProvider,
} from '../../src/lib/data-provider';
import type { DashboardSnapshot, LoadProfile } from '../../src/lib/types';

const FIXED_NOW = Date.parse('2026-10-26T12:00:00.000Z');

function profile(overrides: Partial<LoadProfile> = {}): LoadProfile {
  return {
    globalReadsPerMinute: 100_000,
    readsPerIpPerMinute: 100_000,
    maxConcurrentRequests: 100,
    ...overrides,
  };
}

describe('dashboard data provider', () => {
  it('validates map parameters against the allowlist', () => {
    expect(isMapId('DeepDesert')).toBe(true);
    expect(isMapId('HaggaBasin')).toBe(true);
    expect(isMapId('hagga-basin')).toBe(false);
    expect(parseMapParam(undefined)).toBe('HaggaBasin');
    expect(parseMapParam(['DeepDesert'])).toBe('DeepDesert');
    expect(parseMapParam('bogus')).toBe('HaggaBasin');
  });

  it('builds deterministic snapshots matching the project payload shapes', async () => {
    const provider = new MockDashboardDataProvider({ loadProfile: profile(), now: () => FIXED_NOW });
    const first = await provider.readSnapshot('HaggaBasin', 'unit-shape');
    const second = await provider.readSnapshot('HaggaBasin', 'unit-shape');
    expect(second).toEqual(first);
    expect(Number.isNaN(Date.parse(first.observedAt))).toBe(false);
    expect(first.spiceSectors.length).toBeGreaterThan(0);
    for (const sector of first.spiceSectors) {
      expect(sector.id).toMatch(/^[A-I][1-9]$/);
    }
    expect(first.marketCounts.listings).toBeGreaterThan(0);
    expect(first.marketCounts.items).toBeGreaterThan(0);
    expect(first.populationHistory.from).toBe(FIXED_NOW - 86_400_000);
    expect(first.populationHistory.points.length).toBeGreaterThan(200);
    expect(first.populationHistory.peak).toBeGreaterThan(0);
    expect(first.systemLogs.length).toBeGreaterThan(0);
  });

  it('rejects excess concurrent reads instead of queueing them', async () => {
    const provider = new MockDashboardDataProvider({
      loadProfile: profile({ maxConcurrentRequests: 1 }),
      now: () => FIXED_NOW,
    });
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => provider.readSnapshot('DeepDesert', 'unit-capacity')),
    );
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(rejected.length).toBeGreaterThan(0);
    for (const result of rejected) {
      expect((result as PromiseRejectedResult).reason).toBeInstanceOf(ProviderBusyError);
    }
  });

  it('enforces the per-IP fixed window', async () => {
    const provider = new MockDashboardDataProvider({
      loadProfile: profile({ readsPerIpPerMinute: 2 }),
      now: () => FIXED_NOW,
    });
    await provider.readSnapshot('HaggaBasin', 'unit-ip-window');
    await provider.readSnapshot('HaggaBasin', 'unit-ip-window');
    await expect(provider.readSnapshot('HaggaBasin', 'unit-ip-window')).rejects.toBeInstanceOf(
      ProviderRateLimitedError,
    );
  });

  it('coalesces concurrent snapshot reads through the factory cache', async () => {
    const first = getDashboardSnapshot('DeepDesert', 'unit-cache');
    const second = getDashboardSnapshot('DeepDesert', 'unit-cache');
    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({ map: 'DeepDesert' });
  });
});

function fakeRedis() {
  const store = new Map<string, string>();
  const zsets = new Map<string, Array<{ score: number; member: string }>>();
  const lists = new Map<string, string[]>();
  return {
    store,
    zsets,
    lists,
    get: vi.fn(async (key: string): Promise<string | null> => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string): Promise<'OK'> => {
      store.set(key, value);
      return 'OK';
    }),
    zrange: vi.fn(async (key: string, min: number, max: number): Promise<unknown[]> =>
      (zsets.get(key) ?? []).filter((entry) => entry.score >= min && entry.score <= max).map((entry) => entry.member),
    ),
    lrange: vi.fn(async (key: string, start: number, stop: number): Promise<unknown[]> =>
      (lists.get(key) ?? []).slice(start, stop < 0 ? undefined : stop + 1),
    ),
  };
}

function envelope(snapshot: DashboardSnapshot): string {
  return JSON.stringify({ version: 1, snapshot });
}

function consolePayload() {
  return {
    markers: {
      capabilities: { spice_active: true },
      coriolisNextCycleAt: new Date(FIXED_NOW + 4 * 3600_000).toISOString(),
      rows: [{ type: 'spice_active', sector: 'C4', solari_per_hour: 150, harvesters: 3 }],
    },
    stats: { totalListings: 100, uniqueItems: 10, playerListings: 40 },
    council: {
      term: { term_id: '42nd Landsraad', end_time: new Date(FIXED_NOW + 2 * 86_400_000).toISOString() },
      tasks: [
        { completed: true, winning_faction: 'Atreides' },
        { completed: true, winning_faction: 'Harkonnen' },
        { completed: false },
      ],
    },
    players: { rows: [{ total_playtime_seconds: 7200 }, { total_playtime_seconds: 3600 }] },
  };
}

describe('RedisDashboardDataProvider', () => {
  it('serves fresh snapshots from the Redis cache without calling the Console', async () => {
    const redis = fakeRedis();
    const cached = new MockDashboardDataProvider({ loadProfile: profile(), now: () => FIXED_NOW });
    redis.store.set('arrakis:dashboard:snapshot:haggabasin', envelope(await cached.readSnapshot('HaggaBasin', 'seed')));
    const request = vi.fn(async () => {
      throw new Error('Console must not be called');
    });
    const provider = new RedisDashboardDataProvider(
      redis,
      { request },
      { loadProfile: profile(), now: () => FIXED_NOW },
    );
    const snapshot = await provider.readSnapshot('HaggaBasin', 'redis-fresh');
    expect(snapshot.map).toBe('HaggaBasin');
    expect(request).not.toHaveBeenCalled();
  });

  it('refreshes from the Console on a cache miss and writes through with a TTL', async () => {
    const redis = fakeRedis();
    redis.zsets.set('arrakis:population:unconfigured', [
      { score: FIXED_NOW - 3600_000, member: '40' },
      { score: FIXED_NOW, member: '60' },
    ]);
    const payload = consolePayload();
    const request = vi.fn(async (_method: 'GET', path: string) => {
      if (path.startsWith('/api/map/markers')) return payload.markers;
      if (path.startsWith('/api/exchange/stats')) return payload.stats;
      if (path.startsWith('/api/admin/landsraad')) return payload.council;
      if (path.startsWith('/api/players')) return payload.players;
      throw new Error(`unexpected path ${path}`);
    });
    const provider = new RedisDashboardDataProvider(
      redis,
      { request },
      { loadProfile: profile(), now: () => FIXED_NOW },
    );
    const snapshot = await provider.readSnapshot('HaggaBasin', 'redis-miss');
    expect(snapshot.spiceSectors).toEqual([
      { id: 'C4', status: 'harvesting', solariPerHour: 150, harvesters: 3, controller: 'Unclaimed' },
    ]);
    expect(snapshot.marketCounts).toEqual({ listings: 100, items: 10, playerListings: 40 });
    expect(snapshot.landsraad).toMatchObject({
      term: '42nd Landsraad',
      decided: 2,
      total: 3,
      atreides: 1,
      harkonnen: 1,
    });
    expect(snapshot.totalPlayHours).toBe(3);
    expect(redis.set).toHaveBeenCalledWith(
      'arrakis:dashboard:snapshot:haggabasin',
      expect.stringContaining('"version":1'),
      'EX',
      30,
    );
    const written = JSON.parse(redis.store.get('arrakis:dashboard:snapshot:haggabasin') ?? '{}');
    expect(written.snapshot.spiceSectors[0].id).toBe('C4');
  });

  it('serves a stale snapshot inside the grace window when the Console fails', async () => {
    const redis = fakeRedis();
    const seed = new MockDashboardDataProvider({ loadProfile: profile(), now: () => FIXED_NOW - 120_000 });
    redis.store.set('arrakis:dashboard:snapshot:deepdesert', envelope(await seed.readSnapshot('DeepDesert', 'seed')));
    const request = vi.fn(async () => {
      throw new Error('Console is down');
    });
    const provider = new RedisDashboardDataProvider(
      redis,
      { request },
      { loadProfile: profile(), now: () => FIXED_NOW },
    );
    const snapshot = await provider.readSnapshot('DeepDesert', 'redis-stale');
    expect(snapshot.map).toBe('DeepDesert');
    expect(request).toHaveBeenCalled();
  });

  it('rejects with a sanitized error when nothing cached and the Console fails', async () => {
    const redis = fakeRedis();
    const request = vi.fn(async () => {
      throw new Error('Console is down');
    });
    const provider = new RedisDashboardDataProvider(
      redis,
      { request },
      { loadProfile: profile(), now: () => FIXED_NOW },
    );
    await expect(provider.readSnapshot('HaggaBasin', 'redis-down')).rejects.toBeInstanceOf(ProviderReadError);
  });

  it('reads system logs from Redis and tolerates malformed rows', async () => {
    const redis = fakeRedis();
    redis.lists.set('arrakis:system:logs', [
      JSON.stringify({
        id: 'a',
        at: new Date(FIXED_NOW).toISOString(),
        level: 'warn',
        source: 'dune-console',
        message: 'lag',
      }),
      'not-json',
      JSON.stringify({ message: 'kept', level: 'info' }),
    ]);
    const payload = consolePayload();
    const request = vi.fn(async (_method: 'GET', path: string) => {
      if (path.startsWith('/api/map/markers')) return payload.markers;
      if (path.startsWith('/api/exchange/stats')) return payload.stats;
      if (path.startsWith('/api/admin/landsraad')) return payload.council;
      return payload.players;
    });
    const provider = new RedisDashboardDataProvider(
      redis,
      { request },
      { loadProfile: profile(), now: () => FIXED_NOW },
    );
    const snapshot = await provider.readSnapshot('HaggaBasin', 'redis-logs');
    expect(snapshot.systemLogs).toHaveLength(2);
    expect(snapshot.systemLogs[0]).toMatchObject({ level: 'warn', source: 'dune-console' });
  });
});
