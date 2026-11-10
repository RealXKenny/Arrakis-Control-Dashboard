import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import type { GuildBaseEntry } from '../../src/features/guilds/base-directory';

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
vi.mock('../../src/features/guilds/server/base-directory-store', () => ({
  readBaseDirectory: mocks.read,
  mutateBaseDirectory: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/base-directory/route';

const entry: GuildBaseEntry = {
  id: randomUUID(),
  revision: randomUUID(),
  name: 'Guild workshop',
  map: 'hagga-basin',
  purpose: 'crafting',
  location: 'South basin',
  contact: 'Quartermaster',
  accessInstructions: 'Ask for permission.',
  notes: '',
  status: 'active',
  createdAt: '2026-11-10T12:00:00.000Z',
  updatedAt: '2026-11-10T12:00:00.000Z',
  updatedByName: 'Verified leader',
};
const context = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') =>
  GET(new Request('https://dashboard.test/api/v2/guilds/2/base-directory'), context(guildId));
const input = () => ({ action: 'status', id: entry.id, revision: entry.revision, status: 'archived' });
const write = (body: unknown = input(), origin = 'https://dashboard.test') =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/base-directory', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context(),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'private-discord-id', username: 'Member' },
    guildId: 'verified-guild',
    roleIds: ['verified'],
  });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'canonical-pawn', controllerId: 'controller' });
  mocks.request.mockResolvedValue({
    rows: [
      { player_id: 'canonical-pawn', controller_id: 'controller', role_id: 100, character_name: 'Verified leader' },
    ],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue([entry]);
  mocks.mutate.mockResolvedValue(entry);
});
describe('private guild base directory API', () => {
  it('requires sign-in and rejects cross-guild or name-only membership before reading listings', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'outsider', role_id: 100, character_name: 'Member' }] });
    expect((await read()).status).toBe(403);
    expect((await read('other-guild')).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('allows current members read-only access with no-store responses and no actor IDs', async () => {
    mocks.request.mockResolvedValue({ rows: [{ controller_id: 'controller', role_id: 1 }] });
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.data.canEdit).toBe(false);
    expect(body.data.entries).toEqual([entry]);
    expect(JSON.stringify(body)).not.toMatch(/private-discord-id|canonical-pawn/);
    expect((await write()).status).toBe(403);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('reverifies leaders on every write and derives the editor name from the current roster', async () => {
    expect((await write()).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(
      '2',
      input(),
      expect.objectContaining({ canEdit: true, authorName: 'Verified leader' }),
    );
    mocks.request.mockResolvedValueOnce({ rows: [{ player_id: 'canonical-pawn', role_id: 50 }] });
    expect((await write()).status).toBe(403);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
    expect(mocks.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('enforces mutation origins, field schemas and streaming body limits', async () => {
    expect((await write({}, 'https://evil.test')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect((await write({ ...input(), canEdit: true })).status).toBe(400);
    expect((await write({ huge: 'x'.repeat(20_000) })).status).toBe(413);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('fails closed on verification outages or rate limits', async () => {
    mocks.linked.mockRejectedValueOnce(new Error('private provider details'));
    const response = await read();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private provider');
    mocks.limit.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    mocks.budget.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('returns revision conflicts and quota errors without repeating writes', async () => {
    for (const code of ['BASE_DIRECTORY_CONFLICT', 'BASE_DIRECTORY_FULL']) {
      mocks.mutate.mockRejectedValueOnce(new AppError('Refresh the directory.', 409, code, true));
      const response = await write();
      expect(response.status).toBe(409);
      expect((await response.json()).code).toBe(code);
    }
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
});
