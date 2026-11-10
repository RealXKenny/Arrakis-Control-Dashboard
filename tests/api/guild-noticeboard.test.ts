import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyNoticeboard } from '../../src/features/guilds/noticeboard';
import { AppError } from '../../src/lib/errors';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  linked: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
  save: vi.fn(),
  limit: vi.fn(),
  budget: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: mocks.linked }));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request: mocks.request }) }));
vi.mock('../../src/features/guilds/server/noticeboard-store', () => ({
  readNoticeboard: mocks.read,
  saveNoticeboard: mocks.save,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/noticeboard/route';

const board = emptyNoticeboard('2');
const context = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') =>
  GET(new Request('https://dashboard.test/api/v2/guilds/2/noticeboard'), context(guildId));
const write = (
  body: unknown = { action: 'settings', revision: null, message: 'Spice run tonight', priorities: '' },
  origin = 'https://dashboard.test',
) =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/noticeboard', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    context(),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'member', username: 'Member' },
    guildId: 'discord-guild',
    roleIds: ['verified'],
  });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'pawn', controllerId: 'controller' });
  mocks.request.mockResolvedValue({
    rows: [{ controller_id: 'controller', role_id: 100, character_name: 'Guild leader' }],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue(board);
  mocks.save.mockResolvedValue(board);
});

describe('private guild noticeboard', () => {
  it('requires sign-in before reading private storage', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await read()).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.linked).not.toHaveBeenCalled();
  });
  it('matches fresh controller IDs for member reads and uses no-store responses', async () => {
    mocks.request.mockResolvedValue({ rows: [{ controller_id: 'controller', role_id: 1 }] });
    const response = await read();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, data: { board, canEdit: false } });
    expect(mocks.request).toHaveBeenCalledWith('GET', '/api/guilds/2/members', { retryRead: false });
  });
  it('denies cross-guild users and matching names without matching IDs', async () => {
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'someone-else', character_name: 'Member', role_id: 100 }] });
    expect((await read()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect((await read('other-guild')).status).toBe(403);
  });
  it('rejects missing, invalid and unsafe identity values', async () => {
    for (const player of [{ linked: false }, { linked: true, pawnId: '' }, { linked: true, pawnId: null }]) {
      mocks.linked.mockResolvedValue(player);
      expect((await read()).status).toBe(403);
    }
    mocks.linked.mockResolvedValue({ linked: true, pawnId: '9007199254740992' });
    mocks.request.mockResolvedValue({ rows: [{ player_id: 9007199254740992, role_id: 100 }] });
    expect((await read()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('fails closed during linked-character or roster outages', async () => {
    mocks.linked.mockRejectedValueOnce(new Error('upstream private details'));
    const response = await read();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain('private details');
    mocks.request.mockRejectedValueOnce(new Error('unavailable'));
    expect((await read()).status).toBe(503);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('reverifies leadership on each mutation, deriving the author server-side', async () => {
    expect((await write()).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith('2', expect.objectContaining({ action: 'settings' }), 'Guild leader');
    mocks.request.mockResolvedValue({ rows: [{ controller_id: 'controller', role_id: 50 }] });
    expect((await write()).status).toBe(403);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it('checks origin before mutation authorization and rejects invalid or oversized bodies', async () => {
    expect((await write({}, 'https://evil.test')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(
      (await write({ action: 'settings', revision: null, message: '', priorities: '', authorName: 'forged' })).status,
    ).toBe(400);
    expect((await write({ huge: 'x'.repeat(20_000) })).status).toBe(413);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('returns revision conflicts without automatically retrying writes', async () => {
    mocks.save.mockRejectedValue(new AppError('Refresh before saving.', 409, 'NOTICEBOARD_CONFLICT', true));
    expect((await write()).status).toBe(409);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });
  it('rejects invalid guild IDs and applies budgets before provider reads', async () => {
    expect((await read('../other')).status).toBe(400);
    mocks.limit.mockResolvedValue({ allowed: false });
    expect((await read()).status).toBe(429);
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.limit.mockResolvedValue({ allowed: true });
    mocks.budget.mockResolvedValue({ allowed: false });
    expect((await read()).status).toBe(429);
    expect(mocks.request).not.toHaveBeenCalled();
  });
});
