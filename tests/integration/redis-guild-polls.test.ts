import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import type { PollDraft } from '../../src/features/guilds/polls';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/polls-store');
const actor = (memberId = 'pawn', canEdit = false) => ({ memberId, canEdit, authorName: 'Verified member' });
const draft = (): PollDraft => ({
  id: randomUUID(),
  question: 'Next guild objective?',
  details: 'Choose one',
  closesAt: new Date(Date.now() + 86_400_000).toISOString(),
  options: [
    { id: randomUUID(), text: 'Spice run' },
    { id: randomUUID(), text: 'Base upgrade' },
  ],
});
const create = (poll = draft(), guildId = '2') =>
  store.mutateGuildPoll(guildId, { action: 'create', poll }, actor('leader', true));
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/polls-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
describe('guild poll Redis storage', () => {
  it('isolates guilds, retains scheduled results and does not extend retention on reads', async () => {
    await create();
    expect(await store.readGuildPolls('3')).toEqual([]);
    expect(await direct.ttl(guildKeys.polls('2'))).toBeGreaterThan(91 * 86_400 - 10);
    await direct.expire(guildKeys.polls('2'), 60);
    await store.readGuildPolls('2');
    expect(await direct.ttl(guildKeys.polls('2'))).toBeLessThanOrEqual(60);
  });
  it('restricts management to leaders and validates deadlines and option membership', async () => {
    await expect(store.mutateGuildPoll('2', { action: 'create', poll: draft() }, actor())).rejects.toMatchObject({
      statusCode: 403,
    });
    for (const closesAt of [
      new Date(Date.now() - 1000).toISOString(),
      new Date(Date.now() + 91 * 86_400_000).toISOString(),
    ])
      await expect(create({ ...draft(), closesAt })).rejects.toMatchObject({ code: 'INVALID_POLL_TIME' });
    const poll = await create();
    for (const action of ['close', 'delete'] as const)
      await expect(
        store.mutateGuildPoll('2', { action, id: poll.id, revision: poll.revision }, actor()),
      ).rejects.toMatchObject({ statusCode: 403 });
    await expect(
      store.mutateGuildPoll(
        '2',
        { action: 'vote', id: poll.id, revision: poll.revision, optionId: randomUUID() },
        actor(),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_POLL_OPTION' });
  });
  it('keeps one ballot per canonical character across accounts, changes choices and permits withdrawal', async () => {
    let poll = await create();
    for (const option of poll.options)
      poll = await store.mutateGuildPoll(
        '2',
        { action: 'vote', id: poll.id, revision: poll.revision, optionId: option.id },
        actor('same-character'),
      );
    expect(poll.votes).toHaveLength(1);
    expect(poll.votes[0].optionId).toBe(poll.options[1].id);
    poll = await store.mutateGuildPoll(
      '2',
      { action: 'withdraw', id: poll.id, revision: poll.revision },
      actor('same-character'),
    );
    expect(poll.votes).toEqual([]);
  });
  it('serializes concurrent votes without duplicates or lost updates', async () => {
    const poll = await create();
    const attempts = await Promise.allSettled(
      ['pawn-a', 'pawn-b'].map((id) =>
        store.mutateGuildPoll(
          '2',
          { action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[0].id },
          actor(id),
        ),
      ),
    );
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [current] = await store.readGuildPolls('2');
    expect(current.votes).toHaveLength(1);
    await expect(
      store.mutateGuildPoll('2', { action: 'delete', id: poll.id, revision: poll.revision }, actor('leader', true)),
    ).rejects.toMatchObject({ code: 'POLL_CONFLICT' });
  });
  it('enforces scheduled closing in Redis even when a vote was validated before the deadline', async () => {
    const poll = await create({ ...draft(), closesAt: new Date(Date.now() + 2000).toISOString() });
    const { getRedisClient } = await import('../../src/lib/redis/client');
    const redis = getRedisClient()!;
    const original = redis.eval.bind(redis);
    let commitAttempted = false;
    const spy = vi.spyOn(redis, 'eval').mockImplementation(async (script, keys, args) => {
      if (script.includes('-- guild-polls-save')) {
        commitAttempted = true;
        await new Promise((resolve) => setTimeout(resolve, 2200));
      }
      return original(script, keys, args);
    });
    try {
      await expect(
        store.mutateGuildPoll(
          '2',
          { action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[0].id },
          actor(),
        ),
      ).rejects.toMatchObject({ code: 'POLL_CLOSED' });
    } finally {
      spy.mockRestore();
    }
    expect(commitAttempted).toBe(true);
    expect((await store.readGuildPolls('2'))[0].votes).toEqual([]);
  });
  it('closes early without reopening and preserves results until deliberate removal', async () => {
    let poll = await create();
    poll = await store.mutateGuildPoll(
      '2',
      { action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[0].id },
      actor(),
    );
    poll = await store.mutateGuildPoll(
      '2',
      { action: 'close', id: poll.id, revision: poll.revision },
      actor('leader', true),
    );
    expect(store.guildPollView(poll, 'pawn').totalVotes).toBe(1);
    for (const action of ['withdraw', 'close'] as const)
      await expect(
        store.mutateGuildPoll('2', { action, id: poll.id, revision: poll.revision }, actor('leader', true)),
      ).rejects.toMatchObject({ code: 'POLL_CLOSED' });
    await expect(
      store.mutateGuildPoll(
        '2',
        { action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[1].id },
        actor(),
      ),
    ).rejects.toMatchObject({ code: 'POLL_CLOSED' });
    await store.mutateGuildPoll('2', { action: 'delete', id: poll.id, revision: poll.revision }, actor('leader', true));
    expect(await direct.exists(guildKeys.polls('2'))).toBe(0);
  });
  it('enforces poll count and voter limits, including changes at full capacity', async () => {
    for (let index = 0; index < 19; index++) await create();
    const attempts = await Promise.allSettled([create(), create()]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(create()).rejects.toMatchObject({ code: 'POLLS_FULL' });
    let [poll] = await store.readGuildPolls('2');
    poll.votes = Array.from({ length: 500 }, (_, index) => ({
      memberId: `pawn-${index}`,
      optionId: poll.options[0].id,
    }));
    await direct.hset(guildKeys.polls('2'), poll.id, JSON.stringify(poll));
    await expect(
      store.mutateGuildPoll(
        '2',
        { action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[0].id },
        actor('extra'),
      ),
    ).rejects.toMatchObject({ code: 'POLL_FULL' });
    poll = await store.mutateGuildPoll(
      '2',
      { action: 'vote', id: poll.id, revision: poll.revision, optionId: poll.options[1].id },
      actor('pawn-0'),
    );
    expect(poll.votes).toHaveLength(500);
    expect(poll.votes.find((vote) => vote.memberId === 'pawn-0')?.optionId).toBe(poll.options[1].id);
  });
  it('fails closed on corrupt storage and deletes polls on dashboard disband', async () => {
    for (const raw of ['invalid-json', 'x'.repeat(131_073)]) {
      await direct.hset(guildKeys.polls('2'), randomUUID(), raw);
      await expect(store.readGuildPolls('2')).rejects.toMatchObject({ code: 'POLLS_UNAVAILABLE' });
      await direct.del(guildKeys.polls('2'));
    }
    await create();
    const { removeGuildStorage } = await import('../../src/features/guilds/server/membership');
    await removeGuildStorage('2');
    expect(await direct.exists(guildKeys.polls('2'))).toBe(0);
  });
});
