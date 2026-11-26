import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/errors';
import type { StoredPoll } from '../../src/features/guilds/polls';

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
vi.mock('../../src/features/guilds/server/polls-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/guilds/server/polls-store')>()),
  readGuildPolls: mocks.read,
  mutateGuildPoll: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/polls/route';

const poll: StoredPoll = {
  id: randomUUID(),
  question: 'Next project?',
  details: 'Choose together',
  closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  options: [
    { id: randomUUID(), text: 'Workshop' },
    { id: randomUUID(), text: 'Storage' },
  ],
  revision: randomUUID(),
  status: 'open',
  createdAt: new Date().toISOString(),
  organizerName: 'Leader',
  votes: [],
};
poll.votes = [
  { memberId: 'canonical-pawn', optionId: poll.options[0].id },
  { memberId: 'private-other-character', optionId: poll.options[1].id },
];
const ctx = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') => GET(new Request('https://dashboard.test/api/v2/guilds/2/polls'), ctx(guildId));
const input = () => ({ action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[0].id });
const write = (body: unknown = input(), origin = 'https://dashboard.test') =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/polls', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'private-discord-id', username: 'Recruit' },
    guildId: 'discord-guild',
    roleIds: ['verified'],
  });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'canonical-pawn', controllerId: 'controller' });
  mocks.request.mockResolvedValue({
    rows: [{ player_id: 'canonical-pawn', controller_id: 'controller', role_id: 1, character_name: 'Verified voter' }],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  mocks.read.mockResolvedValue([poll]);
  mocks.mutate.mockResolvedValue(poll);
});
describe('private guild polls API', () => {
  it('requires sign-in and fresh roster IDs, refusing names and other-guild membership', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'other', character_name: 'Recruit', role_id: 100 }] });
    expect((await read()).status).toBe(403);
    expect((await read('3')).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('returns private no-store totals and derives voter identity from the current character', async () => {
    const response = await read();
    const body = await response.json();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data.polls[0].totalVotes).toBe(2);
    expect(body.data.polls[0].ownOptionId).toBe(poll.options[0].id);
    expect(JSON.stringify(body)).not.toMatch(
      /canonical-pawn|private-other-character|private-discord-id|memberId|"votes"/,
    );
    expect((await write()).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(
      '2',
      input(),
      expect.objectContaining({ memberId: 'canonical-pawn', authorName: 'Verified voter', canEdit: false }),
    );
  });
  it('rechecks leadership for management and never writes to the game Console', async () => {
    mocks.request.mockResolvedValueOnce({ rows: [{ player_id: 'canonical-pawn', role_id: 100 }] });
    expect((await write({ action: 'close', id: poll.id, revision: poll.revision })).status).toBe(200);
    expect(mocks.mutate.mock.calls[0][2].canEdit).toBe(true);
    mocks.mutate.mockRejectedValueOnce(new AppError('Leader required', 403, 'GUILD_LEADER_REQUIRED', true));
    expect((await write({ action: 'close', id: poll.id, revision: poll.revision })).status).toBe(403);
    expect(mocks.mutate.mock.calls[1][2].canEdit).toBe(false);
    expect(mocks.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('checks origins first and rejects forged voters, editing and oversized bodies', async () => {
    expect((await write({}, 'https://evil.test')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect((await write({ ...input(), memberId: 'other' })).status).toBe(400);
    expect((await write({ action: 'edit', poll })).status).toBe(400);
    expect((await write({ details: 'x'.repeat(17_000) })).status).toBe(413);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('fails closed on outages and limits without retrying closed/conflicting votes', async () => {
    mocks.request.mockRejectedValueOnce(new Error('private provider data'));
    const failed = await read();
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private provider data');
    mocks.budget.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    for (const code of ['POLL_CONFLICT', 'POLL_CLOSED']) {
      mocks.mutate.mockRejectedValueOnce(new AppError('Refresh before retrying.', 409, code, true));
      expect((await write()).status).toBe(409);
    }
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
});
