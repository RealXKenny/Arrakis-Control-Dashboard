import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import { emptyProjectsBook, type GuildProjectsBook } from '../../src/features/guilds/projects';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
  mutate: vi.fn(),
  check: vi.fn(),
  readRequests: vi.fn(),
  mutateRequest: vi.fn(),
  limit: vi.fn(),
  budget: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../src/features/guilds/server/projects-store', () => ({
  readProjects: mocks.read,
  mutateProjects: mocks.mutate,
  checkProjectChange: mocks.check,
}));
vi.mock('../../src/features/guilds/server/resource-requests-store', () => ({
  readResourceRequests: mocks.readRequests,
  mutateResourceRequest: mocks.mutateRequest,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/projects/route';
import { projectMemberKey } from '../../src/features/guilds/server/projects-http';
import { estimateFromListings } from '../../src/features/guilds/server/projects-market';

const projectId = randomUUID();
const materialId = randomUUID();
const revision = randomUUID();
function book(material: Partial<GuildProjectsBook['projects'][number]['materials'][number]> = {}): GuildProjectsBook {
  return {
    ...emptyProjectsBook('2'),
    projects: [
      {
        id: projectId,
        revision,
        name: 'Wall',
        summary: '',
        status: 'active',
        createdAt: '2026-11-25T00:00:00.000Z',
        updatedAt: '2026-11-25T00:00:00.000Z',
        createdByName: 'Leader',
        milestones: [],
        materials: [
          {
            id: materialId,
            name: 'Steel',
            unit: 'ingots',
            required: '100',
            templateId: 'SteelIngot',
            responsibleKey: null,
            requestId: null,
            requestLinkedAt: null,
            estimate: null,
            ...material,
          },
        ],
        assignments: [],
        reservations: [],
        contributions: [],
        costs: [],
      },
    ],
  };
}
const context = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') => GET(new Request('https://dashboard.test/api/v2/guilds/2/projects'), context(guildId));
const write = (body: unknown, origin = 'https://dashboard.test') =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/projects', {
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
    rows: [
      { player_id: 'canonical-pawn', controller_id: 'controller', role_id: 1, character_name: 'Fresh Member' },
      { player_id: 'leader-pawn', role_id: 100, character_name: 'Leader' },
    ],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue(book());
  mocks.check.mockResolvedValue(book());
  mocks.mutate.mockResolvedValue({ book: book(), changedId: projectId });
  mocks.readRequests.mockResolvedValue([]);
  mocks.mutateRequest.mockResolvedValue(null);
});

describe('guild projects API', () => {
  it('requires a session and fresh roster membership before reading private records', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    mocks.request.mockResolvedValueOnce({ rows: [{ player_id: 'someone-else', role_id: 1 }] });
    expect((await read()).status).toBe(403);
    expect((await read('bad guild')).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('returns no-store views with hashed member keys and never canonical Console IDs', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.data.selfKey).toBe(projectMemberKey('2', 'canonical-pawn'));
    expect(body.data.canEdit).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/canonical-pawn|leader-pawn|controller/);
  });
  it('keeps the plan visible when resource requests are unavailable', async () => {
    mocks.readRequests.mockRejectedValueOnce(new Error('down'));
    const body = await (await read()).json();
    expect(body.data.requestsAvailable).toBe(false);
    expect(body.data.projects).toHaveLength(1);
  });
  it('derives identity server-side and rejects forged fields, foreign origins and oversized bodies', async () => {
    const input = { action: 'milestone', id: projectId, revision, milestoneId: randomUUID(), done: true };
    expect((await write(input)).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(
      '2',
      input,
      expect.objectContaining({ memberKey: projectMemberKey('2', 'canonical-pawn'), canEdit: false }),
    );
    expect((await write({ ...input, memberKey: 'f'.repeat(64) })).status).toBe(400);
    expect((await write(input, 'https://evil.test')).status).toBe(403);
    expect((await write({ pad: 'x'.repeat(40_000) })).status).toBe(413);
    expect((await write({ action: 'set-estimate', id: projectId, revision, materialId, estimate: {} })).status).toBe(
      400,
    );
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
  it('maps rule refusals to their status without retrying writes', async () => {
    mocks.mutate.mockRejectedValueOnce(new AppError('Leader only.', 403, 'GUILD_LEADER_REQUIRED', true));
    const response = await write({ action: 'project-delete', id: projectId, revision });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('GUILD_LEADER_REQUIRED');
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
  it('observes exchange prices only after a permission check and stores them as a server-side estimate', async () => {
    mocks.request.mockImplementation(async (_method: string, path: string) =>
      path.startsWith('/api/exchange/listings')
        ? {
            rows: [
              { owner_id: 'seller-secret', stock: 4, item_price: '900719925474099312' },
              { owner_id: 'seller-2', stock: 0, item_price: '1' },
              { owner_id: 'seller-3', stock: '7', item_price: '25' },
            ],
          }
        : {
            rows: [
              { player_id: 'canonical-pawn', controller_id: 'controller', role_id: 100, character_name: 'Leader' },
            ],
          },
    );
    expect((await write({ action: 'observe-price', id: projectId, revision, materialId })).status).toBe(200);
    expect(mocks.check).toHaveBeenCalled();
    expect(mocks.request).toHaveBeenCalledWith(
      'GET',
      '/api/exchange/listings?templateId=SteelIngot&owner=all',
      expect.objectContaining({ retryRead: false }),
    );
    const change = mocks.mutate.mock.calls[0]![1];
    expect(change).toMatchObject({
      action: 'set-estimate',
      estimate: { unitPrice: '25', listingCount: 2, stock: '11' },
    });
    expect(JSON.stringify(change)).not.toContain('seller');
    mocks.check.mockRejectedValueOnce(new AppError('Responsible only.', 403, 'MATERIAL_OWNER_REQUIRED', true));
    expect((await write({ action: 'observe-price', id: projectId, revision, materialId })).status).toBe(403);
    expect(mocks.request).toHaveBeenCalledTimes(3);
  });
  it('creates exactly one shortage request with the reserved link and clears the link if creation fails', async () => {
    const linked = randomUUID();
    mocks.mutate.mockResolvedValueOnce({ book: book({ requestId: linked }), changedId: projectId });
    const input = {
      action: 'request-shortage',
      id: projectId,
      revision,
      materialId,
      request: { dropoff: 'Hall', details: '', priority: 'normal' },
    };
    expect((await write(input)).status).toBe(200);
    expect(mocks.mutate.mock.calls[0]![3]).toEqual({ openRequestIds: new Set() });
    expect(mocks.mutateRequest).toHaveBeenCalledTimes(1);
    expect(mocks.mutateRequest).toHaveBeenCalledWith(
      '2',
      expect.objectContaining({
        action: 'save',
        revision: null,
        request: expect.objectContaining({ id: linked, material: 'Steel', quantity: '100', unit: 'ingots' }),
      }),
      expect.objectContaining({ memberId: 'canonical-pawn' }),
    );
    mocks.mutate.mockResolvedValueOnce({ book: book({ requestId: linked }), changedId: projectId });
    mocks.mutate.mockResolvedValueOnce({ book: book(), changedId: projectId });
    mocks.mutateRequest.mockRejectedValueOnce(new AppError('Keep at most 5.', 409, 'RESOURCE_MEMBER_LIMIT', true));
    const failed = await write(input);
    expect(failed.status).toBe(409);
    expect(mocks.mutate.mock.calls.at(-1)![1]).toMatchObject({ action: 'clear-request-link', requestId: linked });
    expect(mocks.mutateRequest).toHaveBeenCalledTimes(2);
  });
});

describe('observed exchange estimates', () => {
  it('ignores unreadable rows, flags partial reads and never invents a price', () => {
    expect(estimateFromListings({ rows: [] }, '2026-11-26T00:00:00.000Z')).toMatchObject({
      unitPrice: null,
      listingCount: 0,
      partial: false,
    });
    expect(
      estimateFromListings(
        {
          rows: [
            { stock: 2, item_price: '1.5' },
            { stock: 1, item_price: 9 },
          ],
        },
        '2026-11-26T00:00:00.000Z',
      ),
    ).toMatchObject({ unitPrice: '9', listingCount: 1, partial: true });
    expect(estimateFromListings({ supported: false }, '2026-11-26T00:00:00.000Z')).toBeNull();
  });
});
