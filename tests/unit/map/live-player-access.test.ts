import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({ linked: vi.fn(), request: vi.fn(), env: vi.fn() }));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../../src/config/env', () => ({ getServerEnv: mocks.env }));
import { clearLivePlayerCache, readLivePlayer } from '../../../src/features/map/server/live-player';

const session = { guildId: 'guild', user: { id: 'account' }, roleIds: [] } as DashboardSession;
const linked = { linked: true, pawnId: 6, controllerId: 9 };
beforeEach(() => {
  clearLivePlayerCache();
  vi.resetAllMocks();
  mocks.env.mockReturnValue({ DUNE_API_URL: 'https://console.test', DISCORD_GUILD_ID: 'guild' });
  mocks.linked.mockResolvedValue(linked);
  mocks.request.mockImplementation((_method, path) =>
    Promise.resolve(
      path.startsWith('/api/map/players')
        ? {
            capabilities: { players: true },
            rows: [
              { id: 6, map: 'Arrakeen', type: 'player', online_status: 'Online', x: 1, y: 2, z: 3, partition_id: 3 },
            ],
          }
        : {
            t: Date.now(),
            sources: [{ map: 'SH_Arrakeen', partition: 3, ready: true }],
            objects: [{ k: 'player', s: 0, x: 4, y: 5, z: 6 }],
          },
    ),
  );
});
describe('live player access', () => {
  it('returns only the current linked identity and position after re-verifying the link', async () => {
    expect(await readLivePlayer(session, 'Arrakeen')).toEqual({ pawnId: '6', x: 4, y: 5, z: 6, partition: 3 });
    expect(mocks.linked).toHaveBeenCalledTimes(2);
  });
  it('falls back when the identity changes or agent is unavailable', async () => {
    mocks.linked.mockResolvedValueOnce(linked).mockResolvedValueOnce({ ...linked, pawnId: 7 });
    expect(await readLivePlayer(session, 'Arrakeen')).toBeNull();
    clearLivePlayerCache();
    mocks.linked.mockResolvedValue(linked);
    mocks.request.mockRejectedValue(new Error('unavailable'));
    expect(await readLivePlayer(session, 'Arrakeen')).toBeNull();
  });
  it('rejects other guilds and insecure transports before contacting providers', async () => {
    expect(await readLivePlayer({ ...session, guildId: 'other' }, 'Arrakeen')).toBeNull();
    mocks.env.mockReturnValue({ DUNE_API_URL: 'http://remote.test', DISCORD_GUILD_ID: 'guild' });
    expect(await readLivePlayer(session, 'Arrakeen')).toBeNull();
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
