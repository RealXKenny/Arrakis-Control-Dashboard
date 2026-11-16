import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  zadd: vi.fn(),
  trimScore: vi.fn(),
  command: vi.fn(),
  expire: vi.fn(),
  zrange: vi.fn(),
  request: vi.fn(),
  restarts: vi.fn(),
}));
vi.mock('../../../src/lib/redis/client', () => ({
  getRedisClient: () => ({
    zadd: mocks.zadd,
    zremrangebyscore: mocks.trimScore,
    command: mocks.command,
    expire: mocks.expire,
    zrange: mocks.zrange,
  }),
}));
vi.mock('../../../src/config/env', () => ({ getServerEnv: () => ({ DUNE_API_URL: 'https://console.test' }) }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../../src/features/monitoring/server/restart-history', () => ({ readRestartHistory: mocks.restarts }));

import {
  observeServerHealth,
  readIncidentTimeline,
  recordHealthObservation,
} from '../../../src/features/monitoring/server/health';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.restarts.mockResolvedValue([]);
  mocks.zrange.mockResolvedValue([]);
});

it('records bounded unavailable observations without exposing provider failures', async () => {
  mocks.request.mockRejectedValue(new Error('private provider detail'));
  const result = await observeServerHealth(Date.parse('2026-11-16T00:00:00Z'));
  expect(result).toEqual({ observations: 1, state: 'unavailable' });
  expect(mocks.zadd).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ member: { at: Date.parse('2026-11-16T00:00:00Z'), state: 'unavailable', services: [] } }),
  );
  expect(mocks.command).toHaveBeenCalledWith(['ZREMRANGEBYRANK', expect.any(String), 0, -10082]);
  expect(mocks.expire).toHaveBeenCalledWith(expect.any(String), 8 * 86400);
});

it('keeps health storage failures visible and restart rows separate from observations', async () => {
  await recordHealthObservation({ at: Date.parse('2026-11-16T00:00:00Z'), state: 'outage', services: [] });
  mocks.zrange.mockResolvedValue([{ at: Date.parse('2026-11-16T00:00:00Z'), state: 'outage', services: [] }]);
  mocks.restarts.mockResolvedValue([
    {
      id: 'restart',
      startedAt: '2026-11-16T00:00:00Z',
      finishedAt: '2026-11-16T00:01:00Z',
      durationSeconds: 60,
      scope: 'map',
      map: 'Hagga Basin',
      result: 'Succeeded',
    },
  ]);
  const data = await readIncidentTimeline(Date.parse('2026-11-16T00:01:00Z'));
  expect(data.entries.map((entry) => entry.kind).sort()).toEqual(['observation', 'restart']);
  expect(data.healthAvailable).toBe(true);
  expect(data.restartsAvailable).toBe(true);
});
