import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import type { Snapshot } from '../../src/features/progression/reading';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/progression/server/store');
const goal = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'level' as const,
  title: 'Reach 50',
  ref: '',
  target: '50',
  balance: null,
  pinned: true,
  done: false,
  note: '',
};
const snapshot = (at: string): Snapshot => ({
  at,
  level: '1',
  xp: null,
  credit: null,
  pocket: null,
  factions: null,
  specs: null,
  journey: null,
  bases: null,
  vehicles: null,
});
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/progression/server/store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
describe('progression planner persistence', () => {
  it('isolates account and character with bounded inactivity retention', async () => {
    const saved = await store.mutatePlanner('user-a', '101', {
      action: 'save-goal',
      item: goal,
      revision: null,
      character: '101',
    });
    expect((await store.readPlanner('user-a', '101')).goals[0]).toMatchObject({ title: 'Reach 50' });
    expect(saved.goals[0].createdAt).toBeTruthy();
    expect((await store.readPlanner('user-b', '101')).goals).toEqual([]);
    expect((await store.readPlanner('user-a', '102')).goals).toEqual([]);
    const key = store.progressionKey('planner', 'user-a', '101');
    expect(key).not.toContain('user-a');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  });
  it('prevents concurrent lost updates and stale overwrites', async () => {
    const first = await store.mutatePlanner('user', '101', {
      action: 'save-goal',
      item: goal,
      revision: null,
      character: '101',
    });
    const results = await Promise.allSettled([
      store.mutatePlanner('user', '101', {
        action: 'set-tracking',
        enabled: true,
        revision: first.revision,
        character: '101',
      }),
      store.mutatePlanner('user', '101', {
        action: 'delete',
        collection: 'goals',
        id: goal.id,
        revision: first.revision,
        character: '101',
      }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(
      store.mutatePlanner('user', '101', {
        action: 'set-tracking',
        enabled: false,
        revision: first.revision,
        character: '101',
      }),
    ).rejects.toMatchObject({ code: 'PROGRESSION_CONFLICT' });
  });
  it('enforces pin and collection limits server-side', async () => {
    let record = await store.readPlanner('user', '101');
    for (let index = 0; index < 8; index++)
      record = await store.mutatePlanner('user', '101', {
        action: 'save-goal',
        item: { ...goal, id: `00000000-0000-4000-8000-00000000010${index}` },
        revision: record.revision,
        character: '101',
      });
    await expect(
      store.mutatePlanner('user', '101', {
        action: 'save-goal',
        item: { ...goal, id: '00000000-0000-4000-8000-000000000999' },
        revision: record.revision,
        character: '101',
      }),
    ).rejects.toMatchObject({ code: 'PROGRESSION_PIN_LIMIT' });
  });
  it('rejects corrupt stored records instead of replacing them', async () => {
    await direct.set(store.progressionKey('planner', 'user', '101'), '{"revision":"x"');
    await expect(store.readPlanner('user', '101')).rejects.toMatchObject({ code: 'PROGRESSION_UNAVAILABLE' });
  });
  it('records journal observations on the interval and fences clears', async () => {
    const first = await store.recordSnapshot('user', '101', null, snapshot('2026-11-20T10:00:00.000Z'), false);
    expect(first.recorded).toBe(true);
    const early = await store.recordSnapshot(
      'user',
      '101',
      first.journal.revision,
      snapshot('2026-11-20T11:00:00.000Z'),
      false,
    );
    expect(early).toEqual({ journal: first.journal, recorded: false });
    const manual = await store.recordSnapshot(
      'user',
      '101',
      first.journal.revision,
      snapshot('2026-11-20T11:00:00.000Z'),
      true,
    );
    expect(manual.journal.snapshots).toHaveLength(2);
    await expect(
      store.recordSnapshot('user', '101', first.journal.revision, snapshot('2026-11-20T20:00:00.000Z'), false),
    ).rejects.toMatchObject({ code: 'PROGRESSION_CONFLICT' });
    const cleared = await store.clearJournal('user', '101', manual.journal.revision);
    expect(cleared.snapshots).toEqual([]);
    expect(cleared.revision).not.toBeNull();
    await expect(store.clearJournal('user', '101', manual.journal.revision)).rejects.toMatchObject({
      code: 'PROGRESSION_CONFLICT',
    });
  });
});
