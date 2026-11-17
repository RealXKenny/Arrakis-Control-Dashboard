import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import type { StoredResourceRequest } from '../../src/features/guilds/resource-requests';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  limit: vi.fn(),
  budget: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../src/features/guilds/server/resource-requests-store', () => ({
  readResourceRequests: mocks.read,
  mutateResourceRequest: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/resource-requests/route';

const record: StoredResourceRequest = {
  id: randomUUID(),
  revision: randomUUID(),
  material: 'Steel',
  quantity: '100',
  unit: 'ingots',
  dropoff: 'Base',
  details: '',
  priority: 'normal',
  status: 'open',
  requesterId: 'requester-private-id',
  requesterName: 'Requester',
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
  pledges: [],
};
const context = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') =>
  GET(new Request('https://dashboard.test/api/v2/guilds/2/resource-requests'), context(guildId));
const input = () => ({ action: 'pledge', id: record.id, revision: record.revision, quantity: '900719925474099312' });
const write = (body: unknown = input(), origin = 'https://dashboard.test') =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/resource-requests', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context(),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'discord-member', username: 'Member' },
    guildId: 'verified-guild',
    roleIds: ['verified'],
  });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'alias-pawn', controllerId: 'controller' });
  mocks.request.mockResolvedValue({
    rows: [{ player_id: 'canonical-pawn', controller_id: 'controller', role_id: 1, character_name: 'Fresh Supplier' }],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue([record]);
  mocks.mutate.mockResolvedValue(record);
});
describe('private guild resource API', () => {
  it('rejects anonymous and cross-guild reads before private storage', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'other', role_id: 100, character_name: 'Member' }] });
    expect((await read()).status).toBe(403);
    expect((await read('other-guild')).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('returns no-store views without canonical requester IDs', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.data.canEdit).toBe(false);
    expect(body.data.requests[0].isRequester).toBe(false);
    expect(JSON.stringify(body)).not.toContain('requester-private-id');
  });
  it('derives signup identity and permissions freshly and preserves exact decimal strings', async () => {
    expect((await write()).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(
      '2',
      input(),
      expect.objectContaining({ memberId: 'canonical-pawn', authorName: 'Fresh Supplier', canEdit: false }),
    );
    expect((await write({ ...input(), supplierId: 'forged' })).status).toBe(400);
    mocks.request.mockResolvedValueOnce({ rows: [] });
    expect((await write()).status).toBe(403);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign origins, oversized bodies and numeric or fractional quantities', async () => {
    expect((await write({}, 'https://evil.test')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect((await write({ huge: 'x'.repeat(20_000) })).status).toBe(413);
    for (const quantity of [100, '1.5', '0', '1e3']) expect((await write({ ...input(), quantity })).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('fails closed on verification outages or exhausted budgets', async () => {
    mocks.linked.mockRejectedValueOnce(new Error('private upstream details'));
    const response = await read();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private upstream');
    mocks.limit.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    mocks.budget.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('reports ownership, capacity and revision refusals without repeating writes', async () => {
    for (const [code, status] of [
      ['RESOURCE_MANAGER_REQUIRED', 403],
      ['RESOURCE_OVERCOMMITTED', 409],
      ['RESOURCE_CONFLICT', 409],
    ] as const) {
      mocks.mutate.mockRejectedValueOnce(new AppError('Refresh the resource request.', status, code, true));
      const response = await write();
      expect(response.status).toBe(status);
      expect((await response.json()).code).toBe(code);
    }
    expect(mocks.mutate).toHaveBeenCalledTimes(3);
  });
});
