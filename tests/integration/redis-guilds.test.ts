import { createHash, randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';

/**
 * The guild recruitment, application, review and chat handlers with their Lua scripts against a REAL Redis
 * (standalone or Cluster). Only the outside world is faked: the signed-in member, the linked-character lookup and the
 * Dune Console. Every Redis read and write is the production code path.
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
  // The signed-in member is named by the session cookie, so concurrent requests cannot be mixed up.
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

const GUILD = '2';
const TAG = 'arrakis:{guilds}';
const recordsKey = `${TAG}:applications:${GUILD}`;
const indexKey = `${TAG}:applications-index:${GUILD}`;
const requirementsKey = `${TAG}:requirements:${GUILD}`;
const question = {
  id: '915c1a9c-13a6-4eef-833b-121c513f9a5a',
  label: 'Why would you like to join?',
  required: true,
  type: 'longText' as const,
};

let direct: Redis;
let applications: typeof import('../../src/features/guilds/server/applications');
let chat: typeof import('../../src/features/guilds/server/chat');
let questionFields: typeof import('../../src/features/guilds/question-fields');

const applicationId = (user: string) => createHash('sha256').update(`${GUILD}:${user}`).digest('hex');
const req = (body?: unknown, query: Record<string, string> = {}) => ({
  url: `/api/guilds/${GUILD}/application`,
  query: { guildId: GUILD, ...query },
  headers: { cookie: `dashboard_session=${who.id}`, origin: 'http://localhost', host: 'localhost' },
  body,
});
const as = (user: string) => {
  who.id = user;
};
const parse = (response: { body: string }) => JSON.parse(response.body);
const form = () => ({
  answers: { [question.id]: 'I would like to help build and gather.' },
  questionVersion: questionFields.guildQuestionVersion([question]),
});
const publish = (questions = [question], published = true) =>
  direct.set(
    requirementsKey,
    JSON.stringify({
      guildName: 'Crimson Skies',
      requirements: 'Be friendly',
      contact: '',
      published,
      applicationQuestions: questions,
    }),
  );
const apply = (user: string) => {
  as(user);
  return applications.POST(req(form()), {});
};
const dump = async () => {
  const out: Record<string, unknown> = {};
  for (const key of (await direct.keys('*')).sort()) {
    const type = await direct.type(key);
    out[key] =
      type === 'hash'
        ? await direct.hgetall(key)
        : type === 'zset'
          ? await direct.zrange(key, 0, -1, 'WITHSCORES')
          : type === 'list'
            ? await direct.lrange(key, 0, -1)
            : await direct.get(key);
  }
  return out;
};
const code = async (promise: Promise<unknown>) =>
  promise.then(
    () => 'ok',
    (error: { code?: string }) => error.code ?? 'error',
  );

beforeAll(async () => {
  direct = connectDirect(target);
  applications = await import('../../src/features/guilds/server/applications');
  chat = await import('../../src/features/guilds/server/chat');
  questionFields = await import('../../src/features/guilds/question-fields');
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
beforeEach(async () => {
  await direct.flushdb();
  as('leader');
  request.mockReset();
  request.mockImplementation(async (method: string) =>
    method === 'GET' ? { rows: [{ player_id: 'pawn-leader', role_id: '100' }] } : { ok: true },
  );
  linkedPlayer.mockReset();
  linkedPlayer.mockImplementation(async (input: { userId: string }) => ({
    linked: true,
    pawnId: `pawn-${input.userId}`,
    characterName: `Character ${input.userId}`,
  }));
  await publish();
});

describe('applications on a real Redis', () => {
  it('stores the application, its index entry and a 90-day expiry together', async () => {
    const response = await apply('alice');
    expect(response.status).toBe(201);
    const id = applicationId('alice');
    expect(JSON.parse((await direct.hget(recordsKey, id))!)).toMatchObject({ discordId: 'alice', status: 'pending' });
    expect(await direct.zcard(indexKey)).toBe(1);
    for (const key of [recordsKey, indexKey]) {
      const ttl = await direct.ttl(key);
      expect(ttl).toBeGreaterThan(89 * 86_400);
      expect(ttl).toBeLessThanOrEqual(90 * 86_400);
    }
  });

  it('a second application from the same member is refused and changes nothing', async () => {
    await apply('alice');
    const before = await dump();
    expect(await code(apply('alice'))).toBe('GUILD_APPLICATION_EXISTS');
    expect(await dump()).toEqual(before);
  });

  it('concurrent applications from different members are all stored consistently', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, (_, n) => code(apply(`member-${n}`))));
    expect(results.every((result) => result === 'ok')).toBe(true);
    expect(await direct.hlen(recordsKey)).toBe(25);
    expect(await direct.zcard(indexKey)).toBe(25);
  });

  it('the same member submitting twenty times at once stores exactly one application', async () => {
    as('alice');
    const results = await Promise.all(Array.from({ length: 20 }, () => code(applications.POST(req(form()), {}))));
    expect(results.filter((result) => result === 'ok')).toHaveLength(1);
    expect(results.filter((result) => result === 'GUILD_APPLICATION_EXISTS')).toHaveLength(19);
    expect(await direct.hlen(recordsKey)).toBe(1);
    expect(await direct.zcard(indexKey)).toBe(1);
  });

  it('refuses the 201st application and leaves the inbox untouched', async () => {
    const pipeline = direct.pipeline();
    for (let n = 0; n < 200; n += 1) {
      pipeline.hset(recordsKey, `filler-${n}`, '{}');
      pipeline.zadd(indexKey, -n, `filler-${n}`);
    }
    await pipeline.exec();
    expect(await code(apply('alice'))).toBe('GUILD_APPLICATION_INBOX_FULL');
    expect(await direct.hlen(recordsKey)).toBe(200);
    expect(await direct.zcard(indexKey)).toBe(200);
    expect(await direct.hexists(recordsKey, applicationId('alice'))).toBe(0);
  });

  it('writes nothing when the form changes after validation but before the script runs', async () => {
    linkedPlayer.mockImplementationOnce(async (input: { userId: string }) => {
      await publish([{ ...question, label: 'A different question?' }]);
      return { linked: true, pawnId: `pawn-${input.userId}`, characterName: 'Alice' };
    });
    const before = await direct.hlen(recordsKey);
    expect(await code(apply('alice'))).toBe('GUILD_APPLICATION_FORM_CHANGED');
    expect(await direct.hlen(recordsKey)).toBe(before);
    expect(await direct.exists(indexKey)).toBe(0);
  });

  it('writes nothing when recruitment is switched off after validation', async () => {
    linkedPlayer.mockImplementationOnce(async (input: { userId: string }) => {
      await publish([question], false);
      return { linked: true, pawnId: `pawn-${input.userId}`, characterName: 'Alice' };
    });
    expect(await code(apply('alice'))).toBe('GUILD_NOT_RECRUITING');
    expect(await direct.exists(recordsKey)).toBe(0);
  });

  it('malformed stored applications are ignored by reads instead of breaking them', async () => {
    await apply('alice');
    await direct.hset(recordsKey, 'garbage', 'not json');
    await direct.zadd(indexKey, 5, 'garbage');
    await direct.zadd(indexKey, 6, 'dangling-index-entry');
    as('alice');
    expect(parse(await applications.GET(req(), {})).data).toMatchObject({ discordId: 'alice' });
    as('leader');
    const listed = parse(await applications.LIST(req(), {})).data.rows;
    expect(listed.map((row: { discordId: string }) => row.discordId)).toEqual(['alice']);
  });

  it('a member cannot read the inbox, and a non-leader reviewer is rejected', async () => {
    await apply('alice');
    as('mallory');
    expect(await code(applications.LIST(req(), {}))).toBe('GUILD_LEADER_REQUIRED');
    expect(
      await code(applications.REVIEW(req({ applicationId: applicationId('alice'), status: 'declined' }), {})),
    ).toBe('GUILD_LEADER_REQUIRED');
    expect(JSON.parse((await direct.hget(recordsKey, applicationId('alice')))!).status).toBe('pending');
  });
});

describe('review on a real Redis', () => {
  const review = (id: string, status: 'accepted' | 'declined' | 'remove') =>
    applications.REVIEW(req({ applicationId: id, status }), {});

  it('declining updates the status, keeps the index and releases its lock', async () => {
    await apply('alice');
    as('leader');
    await review(applicationId('alice'), 'declined');
    expect(JSON.parse((await direct.hget(recordsKey, applicationId('alice')))!).status).toBe('declined');
    expect(await direct.zcard(indexKey)).toBe(1);
    expect(await direct.keys(`${TAG}:application-review:*`)).toEqual([]);
  });

  it('only one of many simultaneous reviews of one application proceeds', async () => {
    await apply('alice');
    as('leader');
    const results = await Promise.all(
      Array.from({ length: 15 }, () => code(review(applicationId('alice'), 'declined'))),
    );
    expect(results.filter((result) => result === 'ok').length).toBeGreaterThanOrEqual(1);
    expect(results.every((result) => result === 'ok' || result === 'GUILD_APPLICATION_BUSY')).toBe(true);
    expect(await direct.keys(`${TAG}:application-review:*`)).toEqual([]);
  });

  it('refuses to review while another review holds the lock, and the lock has an expiry', async () => {
    await apply('alice');
    const lock = `${TAG}:application-review:${GUILD}:${applicationId('alice')}`;
    await direct.set(lock, 'someone-else', 'EX', 120);
    as('leader');
    expect(await code(review(applicationId('alice'), 'declined'))).toBe('GUILD_APPLICATION_BUSY');
    expect(await direct.get(lock)).toBe('someone-else');
    expect(await direct.ttl(lock)).toBeGreaterThan(0);
    expect(JSON.parse((await direct.hget(recordsKey, applicationId('alice')))!).status).toBe('pending');
  });

  it('an accepted application cannot be declined, and the record is unchanged', async () => {
    await apply('alice');
    as('leader');
    await review(applicationId('alice'), 'accepted');
    const before = await direct.hget(recordsKey, applicationId('alice'));
    expect(JSON.parse(before!).status).toBe('accepted');
    expect(await code(review(applicationId('alice'), 'declined'))).toBe('GUILD_APPLICATION_ACCEPTED');
    expect(await direct.hget(recordsKey, applicationId('alice'))).toBe(before);
  });

  it('removing an application deletes its record, index entry and chat together', async () => {
    await apply('alice');
    as('alice');
    await chat.POST(
      req({ clientMessageId: randomUUID(), text: 'hello' }, { applicationId: applicationId('alice') }),
      {},
    );
    expect((await direct.keys(`${TAG}:chat:*`)).length).toBeGreaterThan(0);
    as('leader');
    await review(applicationId('alice'), 'remove');
    expect(await direct.hlen(recordsKey)).toBe(0);
    expect(await direct.zcard(indexKey)).toBe(0);
    expect(await direct.keys(`${TAG}:chat:*`)).toEqual([]);
    expect(await direct.keys(`${TAG}:application-review:*`)).toEqual([]);
  });

  it('a missing application is a clean 404 that leaves no lock behind', async () => {
    as('leader');
    expect(await code(review(applicationId('nobody'), 'declined'))).toBe('GUILD_APPLICATION_NOT_FOUND');
    expect(await direct.keys(`${TAG}:application-review:*`)).toEqual([]);
  });
});

describe('private chat on a real Redis', () => {
  const send = (user: string, owner: string, text = 'hello', clientMessageId: string = randomUUID()) => {
    as(user);
    return chat.POST(req({ clientMessageId, text }, { applicationId: applicationId(owner) }), {});
  };
  const read = (user: string, owner: string) => {
    as(user);
    return chat.GET(req(undefined, { applicationId: applicationId(owner) }), {});
  };
  const chatKey = async () => (await direct.keys(`${TAG}:chat:*`)).filter((key) => !key.endsWith(':seen'))[0];

  beforeEach(async () => {
    await apply('alice');
  });

  it('applicant and leader see the same ordered conversation; strangers do not', async () => {
    await send('alice', 'alice', 'one');
    await send('leader', 'alice', 'two');
    const applicant = parse(await read('alice', 'alice')).data.messages.map((m: { text: string }) => m.text);
    const leader = parse(await read('leader', 'alice')).data.messages.map((m: { text: string }) => m.text);
    expect(applicant).toEqual(['one', 'two']);
    expect(leader).toEqual(['one', 'two']);
    expect(await code(read('mallory', 'alice'))).toBe('GUILD_LEADER_REQUIRED');
    expect(await code(send('mallory', 'alice'))).toBe('GUILD_LEADER_REQUIRED');
    // Another applicant addressing alice's conversation is treated as a reviewer attempt and refused.
    await apply('bob');
    expect(await code(read('bob', 'alice'))).toBe('GUILD_LEADER_REQUIRED');
  });

  it('a retried send with the same client message id is stored once', async () => {
    const clientMessageId = randomUUID();
    await send('alice', 'alice', 'retry me', clientMessageId);
    await send('alice', 'alice', 'retry me', clientMessageId);
    expect(await direct.llen((await chatKey())!)).toBe(1);
  });

  it('keeps only the newest 100 messages', async () => {
    for (let n = 0; n < 105; n += 1) await send('alice', 'alice', `message ${n}`);
    const key = (await chatKey())!;
    expect(await direct.llen(key)).toBe(100);
    expect(JSON.parse((await direct.lindex(key, 0))!).text).toBe('message 5');
    expect(JSON.parse((await direct.lindex(key, -1))!).text).toBe('message 104');
  });

  it('simultaneous distinct sends are all kept and simultaneous duplicates collapse', async () => {
    await Promise.all(Array.from({ length: 30 }, (_, n) => send('alice', 'alice', `parallel ${n}`)));
    const key = (await chatKey())!;
    expect(await direct.llen(key)).toBe(30);
    const duplicate = randomUUID();
    await Promise.all(Array.from({ length: 12 }, () => send('alice', 'alice', 'dup', duplicate)));
    expect(await direct.llen(key)).toBe(31);
  });

  it('chat expiry follows the application and a message cannot outlive it', async () => {
    await send('alice', 'alice');
    const key = (await chatKey())!;
    const parentTtl = await direct.ttl(recordsKey);
    expect(Math.abs((await direct.ttl(key)) - parentTtl)).toBeLessThanOrEqual(2);
  });

  it('does not write to a conversation whose application has expired', async () => {
    await send('alice', 'alice');
    const key = (await chatKey())!;
    await direct.del(recordsKey);
    expect(await code(send('alice', 'alice'))).toBe('GUILD_APPLICATION_NOT_FOUND');
    expect(await direct.llen(key)).toBe(1);
  });

  it('skips malformed stored messages when reading', async () => {
    await send('alice', 'alice', 'good');
    await direct.rpush((await chatKey())!, 'not json', '{"id":"bad"}');
    const messages = parse(await read('alice', 'alice')).data.messages;
    expect(messages.map((message: { text: string }) => message.text)).toEqual(['good']);
  });

  it('read receipts count only unseen reviewer messages and survive repeated acknowledgements', async () => {
    await send('leader', 'alice', 'first');
    await send('leader', 'alice', 'second');
    const messages = parse(await read('alice', 'alice')).data.messages;
    expect(messages).toHaveLength(2);
    as('alice');
    const ack = (list: unknown[]) =>
      chat.READ(req({ messages: list }, { applicationId: applicationId('alice') }), {}).then(parse);
    const one = [{ id: messages[0].id, senderId: messages[0].senderId }];
    expect((await ack(one)).data.unreadCount).toBe(1);
    expect((await ack(one)).data.unreadCount).toBe(1);
    expect(
      (await ack(messages.map((m: { id: string; senderId: string }) => ({ id: m.id, senderId: m.senderId })))).data
        .unreadCount,
    ).toBe(0);
    // A reviewer cannot move the applicant's receipt.
    as('leader');
    expect(await code(chat.READ(req({ messages: one }, { applicationId: applicationId('alice') }), {}))).toBe(
      'FORBIDDEN',
    );
  });
});

describe('application status and guild removal on a real Redis', () => {
  const sendAs = (user: string, owner: string, text: string, guild = GUILD) => {
    as(user);
    return chat.POST(
      { ...req({ clientMessageId: randomUUID(), text }, { applicationId: applicationId(owner), guildId: guild }) },
      {},
    );
  };

  it('summarises only the member’s own application, with the unread reviewer count', async () => {
    const status = await import('../../src/features/guilds/server/application-status');
    const { getRedisClient } = await import('../../src/lib/redis/client');
    await apply('alice');
    await sendAs('leader', 'alice', 'a reviewer note');
    await sendAs('alice', 'alice', 'an applicant note');
    const summaries = await status.readApplicationSummaries(getRedisClient()!, 'alice', [GUILD, '404']);
    expect(summaries[GUILD]).toMatchObject({ id: applicationId('alice'), status: 'pending', unreadCount: 1 });
    expect(summaries['404']).toBeNull();
    // Someone else asking about the same guild learns nothing about alice's application.
    expect((await status.readApplicationSummaries(getRedisClient()!, 'bob', [GUILD]))[GUILD]).toBeNull();
    // A record whose stored owner does not match the key is ignored.
    await direct.hset(
      recordsKey,
      applicationId('bob'),
      JSON.stringify({
        ...JSON.parse((await direct.hget(recordsKey, applicationId('alice')))!),
        id: applicationId('bob'),
      }),
    );
    expect((await status.readApplicationSummaries(getRedisClient()!, 'bob', [GUILD]))[GUILD]).toBeNull();
  });

  it('removing a guild deletes all of its data and nothing belonging to another guild', async () => {
    const membership = await import('../../src/features/guilds/server/membership');
    await apply('alice');
    await sendAs('alice', 'alice', 'hello');
    await direct.set(`${TAG}:logo:${GUILD}`, 'logo-bytes');
    await direct.zadd(`${TAG}:requirements-index`, -Date.now(), `guild:${GUILD}`);
    await direct.zadd(`${TAG}:requirements-index`, -Date.now(), 'guild:3');
    const supportMessageId = randomUUID();
    await direct.rpush(
      `${TAG}:support:${GUILD}`,
      JSON.stringify({
        id: supportMessageId,
        senderId: 'leader',
        senderName: 'L',
        role: 'applicant',
        text: 'x',
        sentAt: 1,
      }),
    );
    await direct.hset(`${TAG}:support:${GUILD}:seen`, 'admin', '[]');
    await direct.zadd(`${TAG}:support-unread`, Date.now() + 1e9, `${GUILD}:leader:${supportMessageId}`);
    // Guild 3 keeps everything.
    await direct.set(`${TAG}:requirements:3`, JSON.stringify({ guildName: 'Three' }));
    await direct.set(`${TAG}:logo:3`, 'other-logo');
    await direct.hset(`${TAG}:applications:3`, 'x', '{}');
    await direct.zadd(`${TAG}:support-unread`, Date.now() + 1e9, '3:leader:keep');

    await membership.removeGuildStorage(GUILD);
    const left = await direct.keys('*');
    expect(left.filter((key) => key.includes(`:${GUILD}`) && !key.includes(':3'))).toEqual([]);
    expect(left.sort()).toEqual(
      [
        `${TAG}:applications:3`,
        `${TAG}:logo:3`,
        `${TAG}:requirements-index`,
        `${TAG}:requirements:3`,
        `${TAG}:support-unread`,
      ].sort(),
    );
    expect(await direct.zrange(`${TAG}:requirements-index`, 0, -1)).toEqual(['guild:3']);
    expect(await direct.zrange(`${TAG}:support-unread`, 0, -1)).toEqual(['3:leader:keep']);
  });

  it('removing a guild with corrupt records still completes', async () => {
    const membership = await import('../../src/features/guilds/server/membership');
    await direct.hset(recordsKey, 'garbage', 'not json');
    await direct.rpush(`${TAG}:support:${GUILD}`, 'not json');
    await expect(membership.removeGuildStorage(GUILD)).resolves.toBeUndefined();
    expect(await direct.keys('*')).toEqual([]);
  });
});
