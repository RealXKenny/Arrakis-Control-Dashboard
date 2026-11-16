import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ resolve: vi.fn(), request: vi.fn(), budget: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/player/server/item-finder', () => ({ resolveItemCharacter: state.resolve }));
vi.mock('../../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: state.request }) }));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: state.budget }));
import { lookupAssets } from '../../../src/features/commands/server/lookup';
import { navigationCommands } from '../../../src/features/commands/model';
import { navigationFor } from '../../../src/components/navigation/nav-config';
const session = {
  user: { id: 'own', username: 'Member' },
  guildId: 'guild',
  roleIds: [],
  expiresAt: Date.now() + 60000,
};
const roster = (rank = 1, controller = '202') => ({
  supported: true,
  entries: [{ playerId: controller, canonical: true, rank }],
});
let responses: Record<string, unknown>;
beforeEach(() => {
  vi.clearAllMocks();
  state.resolve.mockResolvedValue({ player: '101', controller: '202' });
  state.budget.mockResolvedValue({ allowed: true });
  responses = {
    '/api/players/101/bases': {
      rows: [
        { id: '11', name: 'Shelter' },
        { id: '12', name: 'Shelter secret' },
      ],
    },
    '/api/players/101/vehicles': { rows: [{ id: '21', name: 'Shelter scout' }] },
    '/api/bases/11/permissions': roster(),
    '/api/bases/12/permissions': roster(1, '999'),
    '/api/vehicles/21/permissions': roster(2),
  };
  state.request.mockImplementation(async (_method, path) => {
    if (!(path in responses)) throw new Error('Unavailable');
    return responses[path];
  });
});
const lookup = (q = 'shelter', signal = new AbortController().signal) => lookupAssets(session, q, signal);
it('uses the canonical route inventory with nested search and permission filtering', () => {
  expect(navigationCommands(navigationFor(), 'base storage')[0].href).toBe('/storage');
  expect(navigationCommands(navigationFor(), 'administration')).toEqual([]);
  expect(new Set(navigationCommands(navigationFor(), '').map((r) => r.href)).size).toBe(
    navigationCommands(navigationFor(), '').length,
  );
});
it('returns only fresh canonical authorized base/vehicle summaries without private rosters or inventory reads', async () => {
  const result = await lookup();
  expect(result.assets.map((a) => a.href)).toEqual([
    '/holdings?view=owned#base-11',
    '/vehicles?view=shared#vehicle-21',
  ]);
  expect(JSON.stringify(result)).not.toMatch(/secret|"controller"|"entries"|"playerId"/);
  expect(result.partial).toBe(true);
  expect(state.resolve).toHaveBeenCalledTimes(2);
  expect(
    state.request.mock.calls.every(
      ([method, path, options]) =>
        method === 'GET' && !/inventory|\/api\/bases\?/.test(path) && options.retryRead === false,
    ),
  ).toBe(true);
});
it('rejects changed links, empty/long queries, unavailable capacity and pre-aborted reads', async () => {
  await expect(lookup('')).rejects.toMatchObject({ statusCode: 400 });
  await expect(lookup('x'.repeat(81))).rejects.toMatchObject({ statusCode: 400 });
  state.budget.mockResolvedValueOnce({ allowed: false });
  await expect(lookup()).rejects.toMatchObject({ statusCode: 429 });
  state.resolve
    .mockResolvedValueOnce({ player: '101', controller: '202' })
    .mockResolvedValueOnce({ player: '102', controller: '203' });
  await expect(lookup()).rejects.toMatchObject({ statusCode: 409 });
  await expect(lookup('shelter', AbortSignal.abort())).rejects.toMatchObject({ statusCode: 504 });
});
it('bounds discovery to 20 each, deduplicates IDs and excludes unsupported, forged and noncanonical permissions', async () => {
  responses['/api/players/101/bases'] = {
    rows: Array.from({ length: 30 }, (_, i) => ({ id: String(11 + i), name: 'Shelter' })),
    totalCount: 200,
  };
  responses['/api/players/101/vehicles'] = {
    rows: [
      { id: '21', name: 'Shelter' },
      { id: '21', name: 'Duplicate' },
      { id: '9007199254740993', name: 'Unsafe ID' },
    ],
  };
  responses['/api/bases/11/permissions'] = { entries: [{ playerId: '202', canonical: false, rank: 1 }] };
  const result = await lookup();
  expect(result.partial).toBe(true);
  expect(result.assets).toHaveLength(1);
  expect(state.request.mock.calls.filter(([, path]) => /bases\/\d+\/permissions/.test(path))).toHaveLength(20);
  expect(state.request.mock.calls.some(([, path]) => /bases\/31\//.test(path))).toBe(false);
});
it('reports partial rather than complete zero when discovery or permission responses fail', async () => {
  responses['/api/players/101/bases'] = { supported: false, rows: [{ id: '11', name: 'Never expose' }] };
  responses['/api/vehicles/21/permissions'] = {
    entries: Array.from({ length: 5001 }, () => ({ playerId: '202', canonical: true, rank: 1 })),
  };
  expect(await lookup()).toMatchObject({ assets: [], partial: true });
});
