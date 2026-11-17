import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import type { GuildBaseDraft } from '../../src/features/guilds/base-directory';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/base-directory-store');
const leader = { canEdit: true, authorName: 'Guild leader' };
const draft = (): GuildBaseDraft => ({
  id: randomUUID(),
  name: 'South workshop',
  map: 'hagga-basin',
  purpose: 'crafting',
  location: 'South of the rock arch',
  contact: 'Quartermaster',
  accessInstructions: 'Contact the quartermaster before entering.',
  notes: 'Bring your own materials.',
});
const create = (guildId = '2', entry = draft()) =>
  store.mutateBaseDirectory(guildId, { action: 'save', revision: null, entry }, leader);
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/base-directory-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('guild base directory Redis storage', () => {
  it('isolates private listings by guild and expires inactive directories without refreshing on reads', async () => {
    const entry = await create();
    expect((await store.readBaseDirectory('2'))[0].accessInstructions).toBe(entry.accessInstructions);
    expect(await store.readBaseDirectory('3')).toEqual([]);
    expect(await direct.ttl(guildKeys.baseDirectory('2'))).toBeGreaterThan(7_775_990);
    await direct.expire(guildKeys.baseDirectory('2'), 60);
    await store.readBaseDirectory('2');
    expect(await direct.ttl(guildKeys.baseDirectory('2'))).toBeLessThanOrEqual(60);
  });
  it('rejects member writes independently of UI controls', async () => {
    const entry = await create();
    for (const action of ['status', 'delete'] as const)
      await expect(
        store.mutateBaseDirectory(
          '2',
          {
            action,
            id: entry.id,
            revision: entry.revision,
            ...(action === 'status' ? { status: 'archived' as const } : {}),
          } as never,
          { canEdit: false, authorName: 'Member' },
        ),
      ).rejects.toMatchObject({ statusCode: 403 });
    expect((await store.readBaseDirectory('2'))[0].status).toBe('active');
  });
  it('prevents concurrent overwrites while preserving creation metadata and recording verified editors', async () => {
    const original = draft();
    const first = await create('2', original);
    const results = await Promise.allSettled([
      store.mutateBaseDirectory(
        '2',
        { action: 'save', revision: first.revision, entry: { ...original, name: 'Changed once' } },
        leader,
      ),
      store.mutateBaseDirectory(
        '2',
        { action: 'save', revision: first.revision, entry: { ...original, name: 'Changed twice' } },
        { canEdit: true, authorName: 'New leader' },
      ),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const [current] = await store.readBaseDirectory('2');
    expect(current.createdAt).toBe(first.createdAt);
    expect(current.revision).not.toBe(first.revision);
    await expect(
      store.mutateBaseDirectory('2', { action: 'delete', id: first.id, revision: first.revision }, leader),
    ).rejects.toMatchObject({ code: 'BASE_DIRECTORY_CONFLICT' });
  });
  it('archives, edits without republishing, restores and deletes listings without resurrecting stale writes', async () => {
    const original = draft();
    let entry = await create('2', original);
    entry = await store.mutateBaseDirectory(
      '2',
      { action: 'status', id: entry.id, revision: entry.revision, status: 'archived' },
      leader,
    );
    entry = await store.mutateBaseDirectory(
      '2',
      { action: 'save', revision: entry.revision, entry: { ...original, notes: 'Old layout' } },
      leader,
    );
    expect(entry.status).toBe('archived');
    entry = await store.mutateBaseDirectory(
      '2',
      { action: 'status', id: entry.id, revision: entry.revision, status: 'active' },
      leader,
    );
    expect(entry.status).toBe('active');
    await store.mutateBaseDirectory('2', { action: 'delete', id: entry.id, revision: entry.revision }, leader);
    expect(await direct.exists(guildKeys.baseDirectory('2'))).toBe(0);
    const fresh = await create('2', original);
    expect(fresh.revision).not.toBe(entry.revision);
    await expect(
      store.mutateBaseDirectory('2', { action: 'save', revision: entry.revision, entry: original }, leader),
    ).rejects.toMatchObject({ code: 'BASE_DIRECTORY_CONFLICT' });
  });
  it('enforces the final directory slot atomically under concurrent creation', async () => {
    for (let index = 0; index < 49; index++) await create();
    const attempts = await Promise.allSettled([create(), create()]);
    expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(await store.readBaseDirectory('2')).toHaveLength(50);
    await expect(create()).rejects.toMatchObject({ code: 'BASE_DIRECTORY_FULL' });
  });
  it('rejects corrupt/oversized data and clears directory metadata on guild disband', async () => {
    await direct.hset(guildKeys.baseDirectory('2'), randomUUID(), 'x'.repeat(32_769));
    await expect(store.readBaseDirectory('2')).rejects.toMatchObject({ code: 'BASE_DIRECTORY_UNAVAILABLE' });
    await expect(create()).rejects.toMatchObject({ code: 'BASE_DIRECTORY_UNAVAILABLE' });
    await direct.del(guildKeys.baseDirectory('2'));
    await create();
    const { removeGuildStorage } = await import('../../src/features/guilds/server/membership');
    await removeGuildStorage('2');
    expect(await direct.exists(guildKeys.baseDirectory('2'))).toBe(0);
  });
});
