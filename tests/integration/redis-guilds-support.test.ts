import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

/**
 * Recruitment listings and the leader/administrator support conversation (with its shared unread index) against a
 * REAL Redis, standalone or Cluster. Only the signed-in member, the linked character, the Dune Console and the
 * administrator check are faked.
 *
 *   TEST_REDIS_URL=redis://127.0.0.1:6391/15 npm run test:integration
 *   TEST_REDIS_CLUSTER_NODES=127.0.0.1:7001,127.0.0.1:7002,127.0.0.1:7003 npm run test:integration
 */
const target = integrationTarget();
configureApplication(target);
process.env.AUTH_SECRET = 'integration-secret-integration-secret-0001';

const { who, request, linkedPlayer } = vi.hoisted(() => ({
  who: { id: 'leader' },
  request: vi.fn(),
  linkedPlayer: vi.fn(),
}));
vi.mock('../../src/lib/assert-server', () => ({}));
vi.mock('../../src/features/auth/server/session', () => {
  const getSession = async (sessionId: string) => ({
    user: { id: sessionId, username: `name-${sessionId}` },
    guildId: 'discord-guild',
    roleIds: [],
    expiresAt: Date.now() + 60_000,
  });
  return { getSession, currentSession: () => getSession(who.id) };
});
vi.mock('../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: linkedPlayer }));
vi.mock('../../src/server/integrations/dune', () => ({ getDuneClient: () => ({ request }) }));
vi.mock('../../src/features/guilds/server/guild-registry', () => ({
  authoritativeGuildName: async (id: string) => `Official ${id}`,
  displayGuildName: async (_id: string, stored: string) => stored,
}));
vi.mock('../../src/features/admin/server/access', async () => {
  const { AppError } = await import('../../src/lib/errors');
  return {
    requireDashboardAdmin: async (req: { headers: { cookie: string } }) => {
      if (!req.headers.cookie.includes('dashboard_session=admin'))
        throw new AppError('Forbidden', 403, 'FORBIDDEN', true);
      return {
        user: { id: 'admin', username: 'admin' },
        guildId: 'discord-guild',
        roleIds: [],
        expiresAt: Date.now() + 60_000,
      };
    },
    requireRecentSignIn: () => undefined,
  };
});

const TAG = 'arrakis:{guilds}';
const INDEX = `${TAG}:requirements-index`;
const UNREAD = `${TAG}:support-unread`;
let direct: Redis;
let requirements: typeof import('../../src/features/guilds/server/requirements');
let support: typeof import('../../src/features/guilds/server/support');

const as = (user: string) => {
  who.id = user;
};
const req = (body?: unknown, query: Record<string, string> = {}) => ({
  url: '/api/guilds/x',
  query,
  headers: { cookie: `dashboard_session=${who.id}`, origin: 'http://localhost', host: 'localhost' },
  body,
});
const parse = (response: { body: string }) => JSON.parse(response.body);
const code = (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { code?: string }) => error.code ?? 'error',
  );
const settings = (published = true, name = 'Whatever the form says') => ({
  guildName: name,
  requirements: 'Be friendly',
  contact: 'Discord: leader',
  published,
  applicationQuestions: [],
});
/** Leader of guilds "2" and "3" only; the Console reports nobody else as a leader. */
function leaderOf(guilds: string[]) {
  request.mockImplementation(async (method: string, path: string) => {
    if (method !== 'GET') return { ok: true };
    const guild = decodeURIComponent(path.split('/')[3] ?? '');
    return { rows: guilds.includes(guild) ? [{ player_id: 'pawn-leader', role_id: '100' }] : [] };
  });
}

beforeAll(async () => {
  direct = connectDirect(target);
  requirements = await import('../../src/features/guilds/server/requirements');
  support = await import('../../src/features/guilds/server/support');
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  await direct.flushdb();
  as('leader');
  leaderOf(['2', '3']);
  linkedPlayer.mockReset();
  linkedPlayer.mockImplementation(async (input: { userId: string }) => ({
    linked: true,
    pawnId: `pawn-${input.userId}`,
    characterName: input.userId,
  }));
});

describe('recruitment listings on a real Redis', () => {
  const save = (guild: string, body = settings()) => requirements.POST(req(body, { guildId: guild }), {});

  it('publishes with the Console’s name, indexes it, and unpublishing removes it from the index', async () => {
    const saved = parse(await save('2')).data;
    expect(saved.guildName).toBe('Official 2');
    expect(await direct.zrange(INDEX, 0, -1)).toEqual(['guild:2']);
    await save('2', settings(false));
    expect(await direct.zrange(INDEX, 0, -1)).toEqual([]);
    expect(JSON.parse((await direct.get(`${TAG}:requirements:2`))!).published).toBe(false);
  });

  it('refuses a member who is not the leader and writes nothing', async () => {
    as('mallory');
    linkedPlayer.mockImplementation(async () => ({ linked: true, pawnId: 'pawn-mallory', characterName: 'm' }));
    expect(await code(save('2'))).toBe('GUILD_LEADER_REQUIRED');
    expect(await direct.keys('*')).toEqual([]);
  });

  it('a leader of guild 2 cannot publish for guild 9', async () => {
    expect(await code(save('9'))).toBe('GUILD_LEADER_REQUIRED');
    expect(await direct.keys('*')).toEqual([]);
  });

  it('lists only published guilds, newest first, skipping malformed and dangling entries', async () => {
    await save('2');
    await new Promise((resolve) => setTimeout(resolve, 5));
    await save('3');
    await direct.zadd(INDEX, -Date.now() - 10_000, 'guild:ghost');
    await direct.zadd(INDEX, -Date.now() - 20_000, 'garbage-member');
    await direct.set(`${TAG}:requirements:broken`, 'not json');
    await direct.zadd(INDEX, -Date.now() - 30_000, 'guild:broken');
    const rows = parse(await requirements.LIST(req(undefined, { page: '0' }), {})).data.rows;
    expect(rows.map((row: { guildId: string }) => row.guildId)).toEqual(['3', '2']);
  });

  it('concurrent publish and unpublish leave the index agreeing with each listing', async () => {
    await Promise.all(Array.from({ length: 20 }, (_, n) => save(n % 2 ? '2' : '3', settings(n % 4 !== 0))));
    for (const guild of ['2', '3']) {
      const published = JSON.parse((await direct.get(`${TAG}:requirements:${guild}`))!).published as boolean;
      expect((await direct.zscore(INDEX, `guild:${guild}`)) !== null).toBe(published);
    }
  });
});

describe('leader ↔ administrator support chat on a real Redis', () => {
  const query = (guildId: string) => ({ guildId });
  const leaderSend = (text = 'help', id: string = randomUUID(), guild = '2') => {
    as('leader');
    return support.POST(req({ clientMessageId: id, text }, query(guild)), {});
  };
  const adminSend = (text = 'reply', id: string = randomUUID(), guild = '2') => {
    as('admin');
    return support.ADMIN_POST(req({ clientMessageId: id, text }, query(guild)), {});
  };
  const messagesAs = async (user: 'leader' | 'admin', guild = '2') => {
    as(user);
    const call = user === 'admin' ? support.ADMIN_GET : support.GET;
    return parse(await call(req(undefined, query(guild)), {})).data.messages as Array<{
      id: string;
      senderId: string;
      text: string;
    }>;
  };
  const adminUnread = async (guilds: string[]) => {
    as('admin');
    return parse(await support.ADMIN_STATUS(req(undefined, { guildIds: guilds.join(',') }), {})).data;
  };

  it('both sides see one ordered conversation with a 90-day expiry', async () => {
    await leaderSend('one');
    await adminSend('two');
    expect((await messagesAs('leader')).map((m) => m.text)).toEqual(['one', 'two']);
    expect((await messagesAs('admin')).map((m) => m.text)).toEqual(['one', 'two']);
    const ttl = await direct.ttl(`${TAG}:support:2`);
    expect(ttl).toBeGreaterThan(89 * 86_400);
    expect(ttl).toBeLessThanOrEqual(90 * 86_400);
  });

  it('a retried send is stored once, and 100 messages is the cap', async () => {
    const id = randomUUID();
    await leaderSend('retry', id);
    await leaderSend('retry', id);
    expect(await direct.llen(`${TAG}:support:2`)).toBe(1);
    for (let n = 0; n < 104; n += 1) await leaderSend(`m${n}`);
    expect(await direct.llen(`${TAG}:support:2`)).toBe(100);
  });

  it('simultaneous sends from both sides are all kept', async () => {
    await Promise.all([
      ...Array.from({ length: 15 }, () => leaderSend('from leader')),
      ...Array.from({ length: 15 }, () => adminSend('from admin')),
    ]);
    expect(await direct.llen(`${TAG}:support:2`)).toBe(30);
  });

  it('a leader cannot read or write another guild’s conversation, and a non-admin cannot use the admin routes', async () => {
    await leaderSend('private', randomUUID(), '2');
    as('leader');
    expect(await code(support.GET(req(undefined, query('9')), {}))).toBe('GUILD_LEADER_REQUIRED');
    expect(await code(leaderSend('x', randomUUID(), '9'))).toBe('GUILD_LEADER_REQUIRED');
    expect(await code(support.ADMIN_GET(req(undefined, query('2')), {}))).toBe('FORBIDDEN');
    expect(await code(support.ADMIN_POST(req({ clientMessageId: randomUUID(), text: 'x' }, query('2')), {}))).toBe(
      'FORBIDDEN',
    );
    expect(await direct.llen(`${TAG}:support:9`)).toBe(0);
    expect(await direct.llen(`${TAG}:support:2`)).toBe(1);
  });

  it('keeps the shared unread index in step with acknowledgements', async () => {
    await leaderSend('needs help');
    await leaderSend('still waiting', randomUUID(), '3');
    expect(await direct.zcard(UNREAD)).toBe(2);
    expect((await adminUnread(['2', '3'])).guilds).toEqual({ '2': 1, '3': 1 });
    expect((await adminUnread(['2', '3'])).total).toBe(2);

    const [seen] = await messagesAs('admin', '2');
    as('admin');
    const ack = parse(
      await support.ADMIN_READ(req({ messages: [{ id: seen.id, senderId: seen.senderId }] }, query('2')), {}),
    );
    expect(ack.data.unreadCount).toBe(0);
    expect((await adminUnread(['2', '3'])).guilds).toEqual({ '2': 0, '3': 1 });
    expect(await direct.zcard(UNREAD)).toBe(1);

    await adminSend('answer');
    as('leader');
    expect(parse(await support.STATUS(req(undefined, query('2')), {})).data.unreadCount).toBe(1);
  });

  it('a leader cannot move the administrator’s receipt, and the admin summary rejects malformed lists', async () => {
    await leaderSend('hi');
    const [message] = await messagesAs('leader');
    as('leader');
    // The leader route acknowledges the leader's own receipt only; the unread index (admin's view) is unchanged.
    await support.READ(req({ messages: [{ id: message.id, senderId: message.senderId }] }, query('2')), {});
    expect(await direct.zcard(UNREAD)).toBe(1);
    as('admin');
    for (const guildIds of ['2,2', 'bad id', Array.from({ length: 21 }, (_, n) => `g${n}`).join(',')])
      expect(await code(support.ADMIN_STATUS(req(undefined, { guildIds }), {}))).toBe('INVALID_GUILD_QUERY');
  });

  it('malformed stored messages are skipped and do not break the unread count', async () => {
    await leaderSend('good');
    await direct.rpush(`${TAG}:support:2`, 'not json', '{"role":"applicant"}', '[]');
    expect((await messagesAs('leader')).map((m) => m.text)).toEqual(['good']);
    expect((await adminUnread(['2'])).guilds).toEqual({ '2': 1 });
  });

  it('removes unread-index entries for the messages a full thread pushes out', async () => {
    for (let n = 0; n < 103; n += 1) await leaderSend(`m${n}`);
    // Only messages still in the thread (the newest 100) can be unread.
    expect(await direct.zcard(UNREAD)).toBe(100);
    expect((await adminUnread(['2'])).guilds['2']).toBe(100);
  });
});
