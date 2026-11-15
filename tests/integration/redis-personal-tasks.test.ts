import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import type { TaskDraft } from '../../src/features/tasks/model';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/tasks/server/store');
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/tasks/server/store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
const draft = (): TaskDraft => ({
  id: randomUUID(),
  kind: 'task',
  title: 'Private plan',
  notes: 'Only me',
  priority: 'normal',
  dueDate: '2026-12-01',
  target: { type: 'none' },
});
it('isolates task content by account and refreshes bounded retention without a character link', async () => {
  const record = await store.mutatePersonalTasks('one', { action: 'save', revision: null, task: draft() });
  expect(await store.readPersonalTasks('one')).toEqual(record);
  expect((await store.readPersonalTasks('two')).tasks).toEqual([]);
  const key = store.personalTasksKey('one');
  expect(key).not.toContain('one');
  expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  await direct.expire(key, 5);
  await store.readPersonalTasks('one');
  expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
});
it('fences concurrent creates/status edits and preserves server-owned timestamps', async () => {
  const task = draft();
  const results = await Promise.allSettled(
    Array.from({ length: 8 }, () => store.mutatePersonalTasks('one', { action: 'save', revision: null, task })),
  );
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const record = await store.readPersonalTasks('one');
  const outcomes = await Promise.allSettled([
    store.mutatePersonalTasks('one', {
      action: 'save',
      revision: record.revision,
      task: { ...task, title: 'Changed' },
    }),
    store.mutatePersonalTasks('one', {
      action: 'status',
      revision: record.revision!,
      id: task.id,
      status: 'completed',
    }),
  ]);
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const current = await store.readPersonalTasks('one');
  const completed = await store.mutatePersonalTasks('one', {
    action: 'status',
    revision: current.revision!,
    id: task.id,
    status: 'completed',
  });
  expect(completed.tasks[0].createdAt).toBe(record.tasks[0].createdAt);
  expect(completed.tasks[0].completedAt).not.toBeNull();
  const reopened = await store.mutatePersonalTasks('one', {
    action: 'status',
    revision: completed.revision!,
    id: task.id,
    status: 'open',
  });
  expect(reopened.tasks[0].completedAt).toBeNull();
});
it('requires same-account planning targets and protects linked plans from deletion or kind changes', async () => {
  const project = { ...draft(), kind: 'project' as const };
  const a = await store.mutatePersonalTasks('one', { action: 'save', revision: null, task: project });
  const child = { ...draft(), target: { type: 'project' as const, ref: project.id } };
  await expect(store.mutatePersonalTasks('two', { action: 'save', revision: null, task: child })).rejects.toMatchObject(
    { statusCode: 409 },
  );
  const b = await store.mutatePersonalTasks('one', { action: 'save', revision: a.revision, task: child });
  await expect(
    store.mutatePersonalTasks('one', { action: 'delete', revision: b.revision!, id: project.id }),
  ).rejects.toMatchObject({ code: 'TASK_LINKED' });
  await expect(
    store.mutatePersonalTasks('one', { action: 'save', revision: b.revision, task: { ...project, kind: 'goal' } }),
  ).rejects.toMatchObject({ code: 'INVALID_TASK_LINK' });
  const c = await store.mutatePersonalTasks('one', { action: 'delete', revision: b.revision!, id: child.id });
  const d = await store.mutatePersonalTasks('one', { action: 'delete', revision: c.revision!, id: project.id });
  expect(d.tasks).toEqual([]);
  await expect(
    store.mutatePersonalTasks('one', { action: 'save', revision: null, task: draft() }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('enforces 100 entries and byte bounds without evicting existing personal notes', async () => {
  const tasks = Array.from({ length: 100 }, () => ({
    ...draft(),
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  }));
  const revision = randomUUID();
  const key = store.personalTasksKey('one');
  await direct.set(key, JSON.stringify({ schemaVersion: 1, revision, tasks }));
  await expect(store.mutatePersonalTasks('one', { action: 'save', revision, task: draft() })).rejects.toMatchObject({
    code: 'TASKS_FULL',
  });
  expect((await store.readPersonalTasks('one')).tasks).toHaveLength(100);
});
it('fails closed on corrupt, oversized and wrong-type storage without resetting notes', async () => {
  const key = store.personalTasksKey('one');
  for (const raw of [
    '{bad',
    'x'.repeat(262145),
    JSON.stringify({ schemaVersion: 99, revision: randomUUID(), tasks: [] }),
  ]) {
    await direct.set(key, raw);
    await expect(store.readPersonalTasks('one')).rejects.toMatchObject({ statusCode: 503 });
    await expect(
      store.mutatePersonalTasks('one', { action: 'save', revision: null, task: draft() }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(await direct.get(key)).toBe(raw);
  }
  await direct.del(key);
  await direct.lpush(key, 'bad');
  await expect(store.readPersonalTasks('one')).rejects.toMatchObject({ statusCode: 503 });
});
it('rejects a valid Unicode edit exceeding the byte quota without truncating or losing existing notes', async () => {
  const tasks = Array.from({ length: 100 }, () => ({
    ...draft(),
    notes: '🙂'.repeat(500),
    status: 'open',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: null,
  }));
  const revision = randomUUID();
  const record = { schemaVersion: 1, revision, tasks };
  let remaining = 262000 - Buffer.byteLength(JSON.stringify(record));
  for (const task of tasks) {
    const count = Math.min(1500 - task.notes.length, remaining);
    task.notes += 'x'.repeat(count);
    remaining -= count;
  }
  expect(remaining).toBe(0);
  const before = JSON.stringify(record);
  const key = store.personalTasksKey('one');
  await direct.set(key, before);
  await expect(
    store.mutatePersonalTasks('one', {
      action: 'save',
      revision,
      task: { ...draft(), id: tasks[0].id, notes: '漢'.repeat(1500) },
    }),
  ).rejects.toMatchObject({ code: 'TASKS_TOO_LARGE' });
  expect(await direct.get(key)).toBe(before);
});
