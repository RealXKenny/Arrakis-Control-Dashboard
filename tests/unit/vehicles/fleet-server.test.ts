import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ linked: vi.fn(), request: vi.fn(), budget: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: state.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: state.request }) }));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: state.budget }));
import { readCargo, readFleet } from '../../../src/features/vehicles/server/fleet';

const session = { user: { id: 'discord', username: 'Member' }, guildId: 'g', roleIds: [], expiresAt: Date.now() + 6e4 };
const roster = (rank: number, canonical = true, playerId = '202') => ({
  supported: true,
  entries: [{ playerId, canonical, rank }],
});
let responses: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  state.budget.mockResolvedValue({ allowed: true });
  state.linked.mockResolvedValue({ linked: true, pawnId: '101', controllerId: '202', characterName: 'Same' });
  responses = {
    '/api/players/101/vehicles': {
      rows: [
        { id: '21', name: 'Owned', fuel_percent: 50, x: 1, y: 2, map: 'HaggaBasin', lifecycle_state: 'Default' },
        { id: '22', name: 'Shared', fuel_percent: 10, lifecycle_state: 'Travel', x: 5, y: 5, map: 'DeepDesert' },
        { id: '23', name: 'Spoofed' },
        { id: 'bad', name: 'Invalid' },
      ],
    },
    '/api/vehicles/21/permissions': roster(1),
    '/api/vehicles/22/permissions': roster(3),
    '/api/vehicles/23/permissions': roster(1, false),
    '/api/vehicles/21/storage': {
      supported: true,
      maxSlots: 10,
      usedSlots: 3,
      slots: [
        { templateId: 'Water', name: 'Water', quantity: 9007199254740991 },
        { templateId: 'water', name: 'Water', quantity: '2' },
        { templateId: 'Fuel', name: 'Fuel', quantity: 1.5 },
        { name: 'No template', quantity: 1 },
      ],
    },
  };
  state.request.mockImplementation(async (_method: string, path: string) => {
    if (!(path in responses)) throw new Error(`unexpected ${path}`);
    return responses[path];
  });
});

describe('verified fleet read', () => {
  it('returns only canonical roster vehicles for the freshly linked character', async () => {
    const report = await readFleet(session);
    expect(report.vehicles.map((vehicle) => [vehicle.id, vehicle.relationship])).toEqual([
      ['21', 'owner'],
      ['22', 'associate'],
    ]);
    expect(report.excluded).toBe(2);
    expect(report.vehicles[1].position).toBeNull();
    expect(state.request).toHaveBeenCalledWith('GET', '/api/players/101/vehicles', expect.anything());
    expect(state.request.mock.calls.some((call) => call[1] === '/api/vehicles')).toBe(false);
  });

  it('excludes vehicles whose permission read fails and marks oversized lists partial', async () => {
    delete responses['/api/vehicles/22/permissions'];
    const rows = Array.from({ length: 25 }, (_, n) => ({ id: String(100 + n), name: `V${n}` }));
    responses['/api/players/101/vehicles'] = { rows, totalCount: 25 };
    for (const row of rows) responses[`/api/vehicles/${row.id}/permissions`] = roster(2);
    const report = await readFleet(session);
    expect(report.vehicles).toHaveLength(20);
    expect(report.limited).toBe(true);
  });

  it('fails closed without a verified link, list or read budget', async () => {
    state.linked.mockResolvedValue({ linked: false });
    await expect(readFleet(session)).rejects.toMatchObject({ statusCode: 403 });
    state.linked.mockResolvedValue({ linked: true, pawnId: '101', controllerId: '202' });
    responses['/api/players/101/vehicles'] = { supported: false };
    await expect(readFleet(session)).rejects.toMatchObject({ statusCode: 503 });
    state.budget.mockResolvedValue({ allowed: false });
    await expect(readFleet(session)).rejects.toMatchObject({ statusCode: 429 });
  });
});

describe('verified cargo read', () => {
  it('aggregates exact totals and marks unknown quantities and identities', async () => {
    const cargo = await readCargo(session, '21');
    expect(cargo.totals).toEqual([
      { templateId: 'Fuel', name: 'Fuel', quantity: '0', exact: false },
      { templateId: 'Water', name: 'Water', quantity: '9007199254740993', exact: true },
    ]);
    expect(cargo.limited).toBe(true);
    expect(cargo.maxSlots).toBe(10);
  });

  it('refuses vehicles that are unlisted or lack the canonical roster entry, before reading cargo', async () => {
    await expect(readCargo(session, '99')).rejects.toMatchObject({ statusCode: 404 });
    await expect(readCargo(session, '23')).rejects.toMatchObject({ statusCode: 404 });
    await expect(readCargo(session, 'x')).rejects.toMatchObject({ statusCode: 400 });
    expect(state.request.mock.calls.some((call) => String(call[1]).includes('/23/storage'))).toBe(false);
  });
});
