import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyOnboarding } from '../../src/features/guilds/onboarding';
import { onboardingKey } from '../../src/features/guilds/server/onboarding-access';
import { AppError } from '../../src/lib/errors';

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
vi.mock('../../src/features/guilds/server/onboarding-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/guilds/server/onboarding-store')>()),
  readOnboarding: mocks.read,
  mutateOnboarding: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/server/read-budget', () => ({ spendReadBudget: mocks.budget }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ APP_URL: 'https://dashboard.test', NODE_ENV: 'test', LOG_LEVEL: 'FATAL' }),
}));
import { GET, POST } from '../../src/app/api/v2/guilds/[guildId]/onboarding/route';

const ctx = (guildId = '2') => ({ params: Promise.resolve({ guildId }) });
const read = (guildId = '2') => GET(new Request('https://dashboard.test/api/v2/guilds/2/onboarding'), ctx(guildId));
const write = (body: unknown = { action: 'acknowledge-rules', revision: null }, origin = 'https://dashboard.test') =>
  POST(
    new Request('https://dashboard.test/api/v2/guilds/2/onboarding', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    ctx(),
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: 'discord-secret-id', username: 'Recruit' },
    guildId: 'discord-guild',
    roleIds: ['verified'],
  });
  mocks.linked.mockResolvedValue({ linked: true, pawnId: 'pawn', controllerId: 'controller' });
  mocks.request.mockResolvedValue({
    rows: [
      { player_id: 'pawn', controller_id: 'controller', role_id: 1, character_name: 'Verified recruit' },
      { player_id: 'other', role_id: 1, character_name: 'Other recruit' },
    ],
  });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.budget.mockResolvedValue({ allowed: true });
  const book = emptyOnboarding('2');
  book.members = ['pawn', 'other'].map((id) => ({
    memberKey: onboardingKey('2', id),
    memberName: id,
    mentorKey: null,
    completed: [],
    rulesRevision: null,
    updatedAt: new Date().toISOString(),
  }));
  mocks.read.mockResolvedValue(book);
  mocks.mutate.mockResolvedValue(book);
});
describe('guild onboarding API', () => {
  it('requires sign-in and fresh roster IDs before reading private data', async () => {
    mocks.session.mockResolvedValueOnce(null);
    expect((await read()).status).toBe(401);
    mocks.request.mockResolvedValue({ rows: [{ player_id: 'impostor', character_name: 'Recruit', role_id: 100 }] });
    expect((await read()).status).toBe(403);
    expect((await read('3')).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it('returns only own member progress with no-store and derives actions from the session character', async () => {
    const response = await read();
    const body = await response.json();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(body.data.members).toEqual([]);
    expect(body.data.roster).toEqual([]);
    expect(body.data.self.memberName).toBe('Verified recruit');
    expect(JSON.stringify(body)).not.toMatch(/discord-secret-id|controller|"other"|"pawn"/);
    expect((await write()).status).toBe(200);
    expect(mocks.mutate).toHaveBeenCalledWith(
      '2',
      { action: 'acknowledge-rules', revision: null },
      expect.objectContaining({ memberKey: onboardingKey('2', 'pawn'), canEdit: false }),
    );
  });
  it('rechecks leadership and exposes progress overview only to current leaders', async () => {
    mocks.request.mockResolvedValueOnce({ rows: [{ player_id: 'pawn', role_id: 100 }] });
    expect((await (await read()).json()).data.members).toHaveLength(2);
    mocks.mutate.mockRejectedValueOnce(
      new AppError('Only the guild leader can manage onboarding.', 403, 'GUILD_LEADER_REQUIRED', true),
    );
    expect((await write({ action: 'guide', revision: null, guide: emptyOnboarding('2').guide })).status).toBe(403);
    expect(mocks.mutate.mock.calls[0][2].canEdit).toBe(false);
    expect(mocks.request.mock.calls.every(([method]) => method === 'GET')).toBe(true);
  });
  it('rejects forged ownership, foreign origins and oversized bodies', async () => {
    expect((await write({}, 'https://evil.test')).status).toBe(403);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(
      (
        await write({
          action: 'complete',
          revision: null,
          stepId: randomUUID(),
          completed: true,
          memberKey: onboardingKey('2', 'other'),
        })
      ).status,
    ).toBe(400);
    expect((await write({ notes: 'x'.repeat(33_000) })).status).toBe(413);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it('fails closed on verification/budget outages and never retries conflicts', async () => {
    mocks.request.mockRejectedValueOnce(new Error('private provider details'));
    const failed = await read();
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain('private provider details');
    mocks.budget.mockResolvedValueOnce({ allowed: false });
    expect((await read()).status).toBe(429);
    mocks.mutate.mockRejectedValueOnce(new AppError('Refresh; draft kept.', 409, 'ONBOARDING_CONFLICT', true));
    expect((await write()).status).toBe(409);
    expect(mocks.mutate).toHaveBeenCalledTimes(1);
  });
});
