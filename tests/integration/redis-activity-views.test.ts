import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { defaultActivity } from '../../src/features/activity-views/model';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/activity-views/server/store');
let tasks: typeof import('../../src/features/tasks/server/store');
let data: typeof import('../../src/features/personal-data/server/service');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/activity-views/server/store');
  tasks = await import('../../src/features/tasks/server/store');
  data = await import('../../src/features/personal-data/server/service');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
const view = (name = 'Building') => ({ ...defaultActivity(), id: randomUUID(), name });
it('persists independent named definitions, updates/deletes by CAS and isolates accounts', async () => {
  const a = view();
  const first = await store.mutateActivityViews('a', { action: 'save', revision: null, view: a });
  expect((await store.readActivityViews('b')).views).toEqual([]);
  const next = await store.mutateActivityViews('a', {
    action: 'save',
    revision: first.revision,
    view: { ...a, name: 'Exploring', map: 'DeepDesert' },
  });
  expect(next.views[0].map).toBe('DeepDesert');
  const removed = await store.mutateActivityViews('a', {
    action: 'delete',
    revision: next.revision!,
    id: a.id,
    confirmed: true,
  });
  expect(removed.views).toEqual([]);
  expect(await direct.ttl(store.activityViewsKey('a'))).toBeGreaterThan(89 * 86400);
});
it('serializes concurrent creates and stale updates without lost definitions', async () => {
  const results = await Promise.allSettled(
    ['Building', 'Exploring'].map((name) =>
      store.mutateActivityViews('a', { action: 'save', revision: null, view: view(name) }),
    ),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await store.readActivityViews('a')).views).toHaveLength(1);
  expect(
    results.filter((r) => r.status === 'rejected').map((r) => (r as PromiseRejectedResult).reason.statusCode),
  ).toEqual([409]);
});
it('rejects duplicate names, unsupported settings and a thirteenth view without changing saved state', async () => {
  let record = await store.readActivityViews('a');
  for (let i = 0; i < 12; i++)
    record = await store.mutateActivityViews('a', {
      action: 'save',
      revision: record.revision,
      view: view(`View ${i}`),
    });
  await expect(
    store.mutateActivityViews('a', { action: 'save', revision: record.revision, view: view('Extra') }),
  ).rejects.toMatchObject({ statusCode: 400 });
  await expect(
    store.mutateActivityViews('a', {
      action: 'save',
      revision: record.revision,
      view: { ...record.views[0], name: 'view 1' },
    }),
  ).rejects.toMatchObject({ statusCode: 400 });
  expect(await store.readActivityViews('a')).toEqual(record);
});
it('accepts only an existing same-account project/goal reference and rechecks its kind', async () => {
  const id = randomUUID();
  const plan = {
    id,
    kind: 'project' as const,
    title: 'Own project',
    notes: 'Not copied',
    priority: 'normal' as const,
    dueDate: null,
    target: { type: 'none' as const },
  };
  const owned = await tasks.mutatePersonalTasks('a', { action: 'save', revision: null, task: plan });
  const a = { ...view(), planning: { kind: 'project' as const, id } };
  await expect(store.mutateActivityViews('b', { action: 'save', revision: null, view: a })).rejects.toMatchObject({
    statusCode: 409,
  });
  const saved = await store.mutateActivityViews('a', { action: 'save', revision: null, view: a });
  expect(JSON.stringify(saved)).not.toContain('Not copied');
  await tasks.mutatePersonalTasks('a', { action: 'delete', revision: owned.revision!, id });
  await expect(
    store.mutateActivityViews('a', { action: 'save', revision: saved.revision, view: a }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('exports/erases view settings separately and fences replay after newer content', async () => {
  const a = view();
  const saved = await store.mutateActivityViews('a', { action: 'save', revision: null, view: a });
  expect(await data.exportPersonalData('a', [{ scope: 'views', revision: saved.revision }])).toMatchObject({
    records: [{ scope: 'views', data: { views: [{ name: 'Building' }] } }],
  });
  const erased = await data.erasePersonalData('a', 'views', saved.revision);
  expect(erased.entries).toBe(0);
  await expect(
    store.mutateActivityViews('a', { action: 'save', revision: saved.revision, view: a }),
  ).rejects.toMatchObject({ statusCode: 409 });
  const newer = await store.mutateActivityViews('a', { action: 'save', revision: erased.revision, view: view('New') });
  await expect(store.eraseActivityViews('a', saved.revision)).rejects.toMatchObject({ statusCode: 409 });
  expect(await store.readActivityViews('a')).toEqual(newer);
});
it('fails closed on corrupt/wrong-type/oversized records and preserves their bytes', async () => {
  const key = store.activityViewsKey('a');
  for (const raw of ['', '{corrupt', 'x'.repeat(32769)]) {
    await direct.set(key, raw);
    await expect(store.readActivityViews('a')).rejects.toMatchObject({ statusCode: 503 });
    await expect(store.eraseActivityViews('a', null)).rejects.toMatchObject({ statusCode: 503 });
    expect(await direct.get(key)).toBe(raw);
  }
  await direct.del(key);
  await direct.lpush(key, 'wrong type');
  await expect(store.readActivityViews('a')).rejects.toMatchObject({ statusCode: 503 });
  expect(await direct.type(key)).toBe('list');
});
