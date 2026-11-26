import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ linked: vi.fn(), request: vi.fn(), budget: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: state.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: state.request }) }));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: state.budget }));
import { collectBaseItems } from '../../../src/features/player/server/item-finder';
import { listBaseContainers } from '../../../src/features/upkeep/server/base-access';

const session = {
  user: { id: 'discord', username: 'Member' },
  guildId: 'g',
  roleIds: [],
  expiresAt: Date.now() + 60000,
};
const character = { controller: '202', player: '101' };
const roster = { supported: true, entries: [{ playerId: '202', canonical: true, rank: 2 }] };
const slot = (itemId: string, quantity: string) => ({ itemId, templateId: 'Water_Canister', name: 'Water', quantity });
let responses: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  state.budget.mockResolvedValue({ allowed: true });
  state.linked.mockResolvedValue({ linked: true, pawnId: '101', controllerId: '202' });
  responses = {
    '/api/players/101/bases': {
      rows: [
        { id: '11', name: 'Home' },
        { id: '12', name: 'Outpost' },
      ],
    },
    '/api/bases/11/permissions': roster,
    '/api/bases/12/permissions': roster,
    '/api/bases/11/child-access': {
      supported: true,
      rows: [
        { actorId: '33', currentAccess: 2 },
        { actorId: '34', currentAccess: 1 },
      ],
    },
    '/api/bases/11/inventory': {
      supported: true,
      containers: [
        { placeableId: '33', name: 'Medical chest' },
        { placeableId: '34', name: 'Owner vault' },
        { placeableId: 'bad', name: 'Unknown' },
      ],
    },
    '/api/bases/11/containers/33': {
      supported: true,
      inventories: [{ inventoryId: '44', slots: [slot('1', '9007199254740993'), slot('2', '7')] }],
    },
  };
  state.request.mockImplementation(async (_method: string, path: string) => {
    if (!(path in responses)) throw new Error(`Unexpected read ${path}`);
    return responses[path];
  });
});

describe('base upkeep access', () => {
  it('lists only containers the canonical character can open, without reading their contents', async () => {
    const reading = await listBaseContainers('11', character);
    expect(reading.containers).toEqual([{ containerId: '33', name: 'Medical chest' }]);
    expect(reading.omitted).toBe(2);
    expect(JSON.stringify(reading)).not.toContain('Owner vault');
    expect(state.request).not.toHaveBeenCalledWith('GET', '/api/bases/11/containers/33', expect.anything());
    expect(state.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('refuses bases outside the current list or without canonical permission', async () => {
    await expect(listBaseContainers('99', character)).rejects.toMatchObject({ statusCode: 403 });
    responses['/api/bases/11/permissions'] = {
      supported: true,
      entries: [{ playerId: '202', canonical: false, rank: 1 }],
    };
    await expect(listBaseContainers('11', character)).rejects.toMatchObject({ statusCode: 403 });
    await expect(listBaseContainers('not-a-base', character)).rejects.toMatchObject({ statusCode: 400 });
  });
  it('turns provider failures into a safe unavailable error', async () => {
    responses['/api/bases/11/inventory'] = { supported: false };
    await expect(listBaseContainers('11', character)).rejects.toMatchObject({
      statusCode: 503,
      message: 'Base containers could not be verified.',
    });
  });
  it('collects stockpile stacks from one selected base only, skipping backpack and vehicles', async () => {
    const result = await collectBaseItems(session, '11', ['water_canister'], character);
    expect(result.items.map((item) => item.quantity)).toEqual(['9007199254740993', '7']);
    const paths = state.request.mock.calls.map(([, path]) => path);
    expect(paths).not.toContain('/api/players/101/inventory');
    expect(paths).not.toContain('/api/players/101/vehicles');
    expect(paths.some((path: string) => path.startsWith('/api/bases/12'))).toBe(false);
    expect(result.sources.find((source) => source.status === 'excluded')?.detail).toContain('Restricted');
  });
  it('marks a base that left the current list as limited rather than empty', async () => {
    const result = await collectBaseItems(session, '77', ['water_canister'], character);
    expect(result.items).toEqual([]);
    expect(result.limited).toBe(true);
    expect(result.sources.some((source) => source.detail.includes('not in your current base list'))).toBe(true);
  });
  it('rejects a changed character link and invalid selections', async () => {
    await expect(collectBaseItems(session, '11', ['x'], { controller: '999', player: '101' })).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(collectBaseItems(session, 'abc', ['x'], character)).rejects.toMatchObject({ statusCode: 400 });
    await expect(collectBaseItems(session, '11', [], character)).rejects.toMatchObject({ statusCode: 400 });
  });
});
