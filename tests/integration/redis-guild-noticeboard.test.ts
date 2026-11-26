import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import type { GuildNoticeboard } from '../../src/features/guilds/noticeboard';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/noticeboard-store');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/noticeboard-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
const settings = (revision: string | null, message = 'Tonight: spice run') => ({
  action: 'settings' as const,
  revision,
  message,
  priorities: 'Bring water',
});
async function post(board: GuildNoticeboard, pinned = false) {
  return store.saveNoticeboard(
    board.guildId,
    {
      action: 'save-post',
      revision: board.revision,
      post: { id: randomUUID(), title: 'Spice run', body: 'Meet at the guild base.', pinned },
    },
    'Leader',
  );
}
describe('guild noticeboard storage', () => {
  it('persists bounded private content independently per guild and expires inactive boards', async () => {
    expect((await store.readNoticeboard('2')).revision).toBeNull();
    const board = await store.saveNoticeboard('2', settings(null), 'Leader');
    expect((await store.readNoticeboard('2')).message).toBe(board.message);
    expect((await store.readNoticeboard('3')).message).toBe('');
    const ttl = await direct.ttl(guildKeys.noticeboard('2'));
    expect(ttl).toBeGreaterThan(7_775_990);
    expect(ttl).toBeLessThanOrEqual(7_776_000);
    await direct.expire(guildKeys.noticeboard('2'), 60);
    await store.readNoticeboard('2');
    expect(await direct.ttl(guildKeys.noticeboard('2'))).toBeLessThanOrEqual(60);
  });
  it('permits only one concurrent save and rejects stale revisions after recreation', async () => {
    const attempts = await Promise.allSettled([
      store.saveNoticeboard('2', settings(null, 'One'), 'Leader'),
      store.saveNoticeboard('2', settings(null, 'Two'), 'Leader'),
    ]);
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const old = await store.readNoticeboard('2');
    await direct.del(guildKeys.noticeboard('2'));
    const current = await store.saveNoticeboard('2', settings(null), 'Leader');
    expect(current.revision).not.toBe(old.revision);
    await expect(store.saveNoticeboard('2', settings(old.revision), 'Leader')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
  it('pins, edits and removes announcements without duplicates', async () => {
    let board = await post(await store.readNoticeboard('2'));
    board = await post(board, true);
    expect(board.posts[0].pinned).toBe(true);
    const edited = { ...board.posts[0], title: 'New plan' };
    board = await store.saveNoticeboard(
      '2',
      {
        action: 'save-post',
        revision: board.revision,
        post: { id: edited.id, title: edited.title, body: edited.body, pinned: false },
      },
      'New leader',
    );
    expect(board.posts).toHaveLength(2);
    expect(board.posts.find((entry) => entry.id === edited.id)?.authorName).toBe('New leader');
    board = await store.saveNoticeboard(
      '2',
      { action: 'delete-post', revision: board.revision, id: edited.id },
      'Leader',
    );
    expect(board.posts).toHaveLength(1);
  });
  it('enforces pin and total announcement limits', async () => {
    let board = await store.readNoticeboard('2');
    for (let index = 0; index < 5; index++) board = await post(board, true);
    await expect(post(board, true)).rejects.toMatchObject({ code: 'NOTICEBOARD_PINS_FULL' });
    for (let index = 5; index < 20; index++) board = await post(board);
    await expect(post(board)).rejects.toMatchObject({ code: 'NOTICEBOARD_FULL' });
    expect((await store.readNoticeboard('2')).posts).toHaveLength(20);
  });
  it('fails closed for corrupt or oversized storage and clears the board when disbanded', async () => {
    await direct.set(guildKeys.noticeboard('2'), 'x'.repeat(262_145));
    await expect(store.readNoticeboard('2')).rejects.toThrow();
    await direct.del(guildKeys.noticeboard('2'));
    await store.saveNoticeboard('2', settings(null), 'Leader');
    const { removeGuildStorage } = await import('../../src/features/guilds/server/membership');
    await removeGuildStorage('2');
    expect(await direct.exists(guildKeys.noticeboard('2'))).toBe(0);
  });
});
