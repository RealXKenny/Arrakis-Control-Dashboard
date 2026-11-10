import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import type { StoredOperation } from '../../src/features/guilds/operations';

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
vi.mock('../../src/features/guilds/server/operations-store', () => ({
  readGuildOperations: mocks.read,
  mutateGuildOperation: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/operations/route';

const operation: StoredOperation = {
  id: randomUUID(),
  revision: randomUUID(),
  title: 'Spice patrol',
  kind: 'spice-run',
  details: '',
  meetingPoint: 'Base',
  startsAt: '2027-01-02T12:00:00.000Z',
  endsAt: '2027-01-02T14:00:00.000Z',
  roles: [{ role: 'pilot', capacity: 1 }],
  status: 'scheduled',
  organizerName: 'Leader',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  signups: [
    {
      id: randomUUID(),
      memberId: 'canonical-pawn',
      name: 'Pilot',
      role: 'pilot',
      signedUpAt: '2027-01-01T00:00:00.000Z',
    },
  ],
};
const context = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') => GET(new Request('https://dashboard.test/api/v2/guilds/2/operations'), context(guildId));
const input = () => ({ action: 'join', id: operation.id, revision: operation.revision, role: 'pilot' });
const write = (body: unknown = input(), origin = 'https://dashboard.test') =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/operations', {
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
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'canonical-pawn', controllerId: 'controller' });
  mocks.request.mockResolvedValue({
    rows: [{ player_id: 'canonical-pawn', controller_id: 'controller', role_id: 1, character_name: 'Fresh character' }],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue([operation]);
  mocks.mutate.mockResolvedValue(operation);
});
describe('private guild operations API', () => {
  it('requires a signed-in current guild member before reading private records', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'outsider', role_id: 100, character_name: 'Member' }] });
    expect((await read()).status).toBe(403);
    expect((await read('other-guild')).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('uses fresh canonical roster IDs and never exposes them in operation views', async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.data.operations[0].signups[0].isSelf).toBe(true);
    expect(JSON.stringify(body)).not.toContain('canonical-pawn');
    expect(JSON.stringify(body)).not.toContain('memberId');
    expect(body.data.canEdit).toBe(false);
  });
  it('allows members to join or leave only as the freshly verified character', async () => {
    mocks.linked.mockResolvedValue({ linked: true, pawnId: 'different-alias', controllerId: 'controller' });
    expect((await write()).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(
      '2',
      input(),
      expect.objectContaining({ memberId: 'canonical-pawn', authorName: 'Fresh character', canEdit: false }),
    );
    expect((await write({ action: 'leave', id: operation.id, revision: operation.revision })).status).toBe(200);
    expect((await write({ ...input(), memberId: 'forged' })).status).toBe(400);
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
  it('restricts management and signup removal to freshly verified leaders', async () => {
    const close = { action: 'status', id: operation.id, revision: operation.revision, status: 'cancelled' };
    expect((await write(close)).status).toBe(403);
    expect(
      (await write({ action: 'remove-signup', id: operation.id, revision: operation.revision, signupId: randomUUID() }))
        .status,
    ).toBe(403);
    mocks.request.mockResolvedValueOnce({ rows: [{ player_id: 'canonical-pawn', role_id: 100 }] });
    expect((await write(close)).status).toBe(200);
    expect((await write(close)).status).toBe(403);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
  it('rejects foreign origins before authorization and bounds invalid bodies', async () => {
    expect((await write({}, 'https://evil.test')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect((await write({ huge: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await write({ ...input(), role: 'admin' })).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('fails closed on verification outages or exhausted request budgets', async () => {
    mocks.linked.mockRejectedValueOnce(new Error('private upstream error'));
    const response = await read();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private upstream');
    mocks.limit.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    mocks.budget.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('reports a full role or stale revision without automatically retrying', async () => {
    for (const code of ['OPERATION_ROLE_FULL', 'OPERATIONS_CONFLICT']) {
      mocks.mutate.mockRejectedValueOnce(new AppError('Refresh the operation.', 409, code, true));
      const response = await write();
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe(code);
    }
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
});
