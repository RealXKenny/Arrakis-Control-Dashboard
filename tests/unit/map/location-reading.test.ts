import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({ linked: vi.fn(), request: vi.fn(), env: vi.fn() }));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: mocks.env }));
vi.mock('../../../src/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { loadMapData } from '../../../src/features/map/server/load-map';

const session = { guildId: 'guild', user: { id: 'account' }, roleIds: [], expiresAt: 1 } as DashboardSession;
const linked = { linked: true, pawnId: 6, controllerId: 9 };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.linked.mockResolvedValue(linked);
  mocks.env.mockReturnValue({ DUNE_API_URL: 'https://console.test' });
});

describe('uncalibrated location readings', () => {
  it.each(['Arrakeen', 'HarkoVillage'])('returns only the canonical player on %s', async (map) => {
    mocks.request.mockResolvedValue({
      capabilities: { players: true },
      rows: [
        { id: 7, type: 'player', map, online_status: 'Online', x: 9, y: 9, z: 9, partition_id: 3, name: 'private' },
        { id: 6, type: 'player', map, online_status: 'Online', x: 1, y: 2, z: 3, partition_id: 3, fls_id: 'private' },
      ],
    });
    const result = await loadMapData(session, map);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, location: map, position: { x: 1, y: 2, z: 3, partition: 3 } });
    expect(JSON.stringify(result.body)).not.toContain('private');
    expect(mocks.request).toHaveBeenCalledWith('GET', `/api/map/players?map=${map}`, {
      timeoutMs: 10000,
      retryRead: false,
    });
  });
  it('does not match a different player by name or expose an offline position', async () => {
    mocks.request.mockResolvedValue({
      capabilities: { players: true },
      rows: [
        {
          id: 7,
          name: 'same name',
          type: 'player',
          map: 'Arrakeen',
          online_status: 'Online',
          x: 1,
          y: 2,
          z: 3,
          partition_id: 3,
        },
        { id: 6, type: 'player', map: 'Arrakeen', online_status: 'Offline', x: 1, y: 2, z: 3, partition_id: 3 },
      ],
    });
    expect((await loadMapData(session, 'Arrakeen')).body.position).toBeNull();
  });
  it('fails closed for unsupported data, ambiguous identities, or a changed link', async () => {
    mocks.request.mockResolvedValueOnce({ capabilities: { players: false }, rows: [] });
    expect((await loadMapData(session, 'HarkoVillage')).status).toBe(503);
    const row = {
      id: 6,
      type: 'player',
      map: 'HarkoVillage',
      online_status: 'Online',
      x: 1,
      y: 2,
      z: 3,
      partition_id: 2,
    };
    mocks.request.mockResolvedValueOnce({ capabilities: { players: true }, rows: [row, row] });
    expect((await loadMapData(session, 'HarkoVillage')).status).toBe(503);
    mocks.request.mockResolvedValueOnce({ capabilities: { players: true }, rows: [row] });
    mocks.linked.mockResolvedValueOnce(linked).mockResolvedValueOnce({ ...linked, pawnId: 7 });
    expect((await loadMapData(session, 'HarkoVillage')).status).toBe(409);
  });
  it('rejects insecure transport before contacting either provider', async () => {
    mocks.env.mockReturnValue({ DUNE_API_URL: 'http://remote.example' });
    expect((await loadMapData(session, 'Arrakeen')).status).toBe(503);
    expect(mocks.linked).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
