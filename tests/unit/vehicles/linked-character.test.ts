import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  linked: vi.fn(),
  request: vi.fn(),
}));

vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: async () => ({ allowed: true, retryAfter: 0 }) }));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: state.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: state.request }) }));

const session = (extra: Record<string, unknown> = {}) =>
  ({
    user: { id: '111' },
    guildId: 'guild',
    roleIds: [],
    expiresAt: Date.now() + 60_000,
    ...extra,
  }) as never;

beforeEach(() => {
  vi.resetModules();
  state.linked.mockReset();
  state.request.mockReset();
  state.request.mockResolvedValue({ rows: [] });
});

describe('vehicle owner resolution', () => {
  it('uses the live character link, not the character cached in a 30-day session', async () => {
    state.linked.mockResolvedValue({ linked: true, pawnId: '222', characterName: 'Current' });
    const { loadVehicles } = await import('../../../src/features/vehicles/server/load');
    const result = await loadVehicles(session({ linkedPlayerId: '999', linkedPlayerName: 'Former' }));
    expect(result).toMatchObject({ status: 'ok', playerName: 'Current' });
    expect(state.request).toHaveBeenCalledWith('GET', '/api/players/222/vehicles');
    expect(state.request).not.toHaveBeenCalledWith('GET', expect.stringContaining('999'));
  });

  it('shows nothing once the member is no longer linked', async () => {
    state.linked.mockResolvedValue({ linked: false });
    const { loadVehicles } = await import('../../../src/features/vehicles/server/load');
    expect(await loadVehicles(session({ linkedPlayerId: '999', linkedPlayerName: 'Former' }))).toEqual({
      status: 'unlinked',
    });
    expect(state.request).not.toHaveBeenCalled();
  });
});
