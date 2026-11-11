import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ linked: vi.fn(), request: vi.fn(), budget: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: state.linked }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: state.request }) }));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: state.budget }));
import { findItems } from '../../../src/features/player/server/item-finder';

const session = {
  user: { id: 'discord', username: 'Member' },
  guildId: 'discord-guild',
  roleIds: [],
  expiresAt: Date.now() + 60000,
};
const roster = { supported: true, entries: [{ playerId: '202', canonical: true, rank: 2 }] };
const slot = {
  itemId: '5',
  name: 'Spice',
  quantity: '9007199254740993',
  qualityLevel: 3,
  positionIndex: 0,
  currentDurability: 12,
  maxDurability: 20,
  augments: [{ name: 'Harvest', qualityLevel: 2 }],
};
let responses: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  state.budget.mockResolvedValue({ allowed: true });
  state.linked.mockResolvedValue({ linked: true, pawnId: '101', controllerId: '202', characterName: 'Same name' });
  responses = {
    '/api/players/101/inventory': {
      rows: [{ id: '1', display_name: 'Spice', inventory_type: 0, stack_size: 4, quality_level: 1 }],
    },
    '/api/players/101/bases': { rows: [{ id: '11', name: 'Home' }] },
    '/api/players/101/vehicles': { rows: [{ id: '22', name: 'Scout' }] },
    '/api/bases/11/permissions': roster,
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
        { placeableId: '33', name: 'Supplies' },
        { placeableId: '34', name: 'Secret' },
      ],
    },
    '/api/bases/11/containers/33': { supported: true, inventories: [{ inventoryId: '44', slots: [slot] }] },
    '/api/vehicles/22/permissions': roster,
    '/api/vehicles/22/storage': { supported: true, inventoryId: '55', slots: [slot] },
  };
  state.request.mockImplementation(async (_method, path) => {
    if (!(path in responses)) throw new Error(`Unexpected read ${path}`);
    return responses[path];
  });
});
describe('universal item finder', () => {
  it('finds personal, authorized base and cargo stacks without a game guild and preserves exact quantities', async () => {
    const result = await findItems(session, 'spice');
    expect(result.items).toHaveLength(3);
    expect(result.items[1]).toMatchObject({
      quantity: '9007199254740993',
      grade: '3',
      augments: ['Harvest (grade 2)'],
    });
    expect(result.items[1].location).toContain('Base Home #11 · Supplies #33 · inventory 44 · slot 0');
    expect(result.items[2].location).toContain('Vehicle Scout #22');
    expect(state.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
    expect(state.request.mock.calls.some(([, path]) => /guild|admin|world/.test(path))).toBe(false);
    expect(JSON.stringify(result)).not.toContain('Secret');
    expect(state.request).not.toHaveBeenCalledWith('GET', '/api/bases/11/containers/34', expect.anything());
  });
  it('searches verified template IDs and preserves player augment IDs without inventing details', async () => {
    responses['/api/players/101/inventory'] = {
      rows: [
        {
          id: '1',
          item_name: 'Spice',
          template_id: 'Spice_Template',
          inventory_type: 0,
          stack_size: 4,
          augments: ['Augment_Harvest'],
        },
      ],
    };
    const result = await findItems(session, 'Spice_Template');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].augments).toEqual(['Augment_Harvest']);
  });
  it('does not trust names, relationship filters, cached session character or noncanonical roster rows', async () => {
    responses['/api/bases/11/permissions'] = {
      entries: [{ playerId: '999', name: 'Same name', rank: 1, canonical: true }],
    };
    responses['/api/vehicles/22/permissions'] = { entries: [{ playerId: '202', rank: 1, canonical: false }] };
    const result = await findItems({ ...session, linkedPlayerId: '999' }, 'spice');
    expect(result.items).toHaveLength(1);
    expect(
      state.request.mock.calls.some(([, path]) => path.endsWith('/storage') || path.endsWith('/child-access')),
    ).toBe(false);
    expect(result.sources.filter((entry) => entry.status === 'excluded')).toHaveLength(2);
  });
  it('fails closed on absent child access rather than exposing base rollups', async () => {
    responses['/api/bases/11/child-access'] = { supported: false, reason: 'private diagnostic' };
    const result = await findItems(session, 'spice');
    expect(result.items).toHaveLength(2);
    expect(result.sources).toContainEqual(expect.objectContaining({ name: 'Base Home #11', status: 'unavailable' }));
    expect(JSON.stringify(result)).not.toContain('private diagnostic');
    expect(state.request.mock.calls.some(([, path]) => path === '/api/bases/11/inventory')).toBe(false);
  });
  it('retains other sources when character inventory or a container fails', async () => {
    responses['/api/players/101/inventory'] = { supported: false };
    responses['/api/bases/11/containers/33'] = { found: false };
    const result = await findItems(session, 'spice');
    expect(result.items).toHaveLength(1);
    expect(result.sources.filter((entry) => entry.status === 'unavailable')).toHaveLength(2);
  });
  it('does not treat missing inventory arrays as a successful empty source', async () => {
    responses['/api/vehicles/22/storage'] = {};
    const result = await findItems(session, 'missing');
    expect(result.items).toEqual([]);
    expect(result.sources).toContainEqual(
      expect.objectContaining({ name: 'Vehicle Scout #22', status: 'unavailable' }),
    );
  });
  it('does not count a partial container when another inventory in that response is malformed', async () => {
    responses['/api/bases/11/containers/33'] = {
      supported: true,
      inventories: [{ inventoryId: '44', slots: [slot] }, { inventoryId: '45' }],
    };
    const result = await findItems(session, 'spice');
    expect(result.items).toHaveLength(2);
    expect(result.items.some((item) => item.location.includes('Supplies'))).toBe(false);
    expect(result.sources).toContainEqual(
      expect.objectContaining({ name: 'Base Home #11 · Supplies #33', status: 'unavailable' }),
    );
  });
  it('withholds all provider reads when unlinked or capacity is exhausted', async () => {
    state.linked.mockResolvedValue({ linked: false });
    await expect(findItems(session, 'spice')).rejects.toMatchObject({ code: 'UNLINKED' });
    expect(state.request).not.toHaveBeenCalled();
    state.budget.mockResolvedValue({ allowed: false });
    await expect(findItems(session, 'spice')).rejects.toMatchObject({ code: 'RATE_LIMITED' });
  });
  it('bounds results, stacks, assets and provider timeouts with no automatic retry', async () => {
    responses['/api/players/101/inventory'] = {
      rows: Array.from({ length: 6000 }, (_, i) => ({ id: i, name: 'Spice', inventory_type: 0, quantity: 1 })),
    };
    responses['/api/players/101/bases'] = {
      rows: Array.from({ length: 30 }, (_, i) => ({ id: String(i + 100) })),
      totalCount: 30,
    };
    const result = await findItems(session, 'spice');
    expect(result.items).toHaveLength(200);
    expect(result.limited).toBe(true);
    expect(state.request.mock.calls.filter(([, path]) => /bases\/\d+\/permissions/.test(path))).toHaveLength(20);
    for (const [, , options] of state.request.mock.calls)
      expect(options).toMatchObject({ timeoutMs: 4000, retryRead: false, signal: expect.any(AbortSignal) });
  });
  it('stops provider work after cancellation and does not return stale matches', async () => {
    const controller = new AbortController();
    controller.abort();
    const result = await findItems(session, 'spice', controller.signal);
    expect(state.request).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
    expect(result.sources.every((entry) => entry.status === 'unavailable')).toBe(true);
  });
  it('validates bounded queries before looking up identity', async () => {
    await expect(findItems(session, '')).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    await expect(findItems(session, 'a'.repeat(129))).rejects.toMatchObject({ code: 'INVALID_QUERY' });
    expect(state.linked).not.toHaveBeenCalled();
  });
});
