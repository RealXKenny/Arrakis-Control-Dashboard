import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { emptyTasks } from '../../src/features/tasks/model';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let tasks: typeof import('../../src/features/tasks/server/store');
let privacy: typeof import('../../src/features/privacy/server/store');
let service: typeof import('../../src/features/personal-data/server/service');
beforeAll(async () => {
  direct = connectDirect(target);
  tasks = await import('../../src/features/tasks/server/store');
  privacy = await import('../../src/features/privacy/server/store');
  service = await import('../../src/features/personal-data/server/service');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});
const task = () => ({
  id: randomUUID(),
  kind: 'task' as const,
  title: 'Private task',
  notes: 'Remove this note',
  priority: 'normal' as const,
  dueDate: null,
  target: { type: 'none' as const },
});
it('exports isolated notes and snapshots, then erases notes without changing another account or sharing', async () => {
  const saved = await tasks.mutatePersonalTasks('owner-a', { action: 'save', revision: null, task: task() });
  const other = await tasks.mutatePersonalTasks('owner-b', { action: 'save', revision: null, task: task() });
  const sharing = await privacy.mutatePrivacy('owner-a', {
    action: 'save-draft',
    revision: null,
    card: { category: 'profile', data: { displayName: 'Chosen', about: 'Private sharing note' } },
  });
  const exported = await service.exportPersonalData('owner-a', [
    { scope: 'tasks', revision: saved.revision },
    { scope: 'sharing', revision: sharing.revision },
  ]);
  expect(JSON.stringify(exported)).toContain('Remove this note');
  expect(JSON.stringify(exported)).not.toContain('shareId');
  const erased = await tasks.erasePersonalTasks('owner-a', saved.revision);
  expect(erased.tasks).toEqual([]);
  expect(erased.revision).not.toBe(saved.revision);
  expect(await tasks.readPersonalTasks('owner-b')).toEqual(other);
  expect(await privacy.readPrivacy('owner-a')).toEqual(sharing);
  expect(await direct.ttl(tasks.personalTasksKey('owner-a'))).toBeGreaterThan(89 * 86400);
});
it('atomically revokes sharing links and clears every draft and retained publication snapshot', async () => {
  const shared = await privacy.mutatePrivacy('owner-a', {
    action: 'publish',
    revision: null,
    card: { category: 'profile', data: { displayName: 'Visible name', about: 'Retained snapshot' } },
    hours: 1,
    confirmed: true,
  });
  const erased = await privacy.erasePrivacy('owner-a', shared.revision);
  expect(erased.shareId).not.toBe(shared.shareId);
  expect(Object.values(erased.publications).every((v) => v === null)).toBe(true);
  expect(erased.drafts.profile).toEqual({ displayName: '', about: '' });
  await expect(privacy.readSharedPrivacy(shared.shareId!)).rejects.toMatchObject({ statusCode: 404 });
  expect(await direct.exists(privacy.privacyLinkKey(shared.shareId!))).toBe(0);
  await expect(
    privacy.mutatePrivacy('owner-a', {
      action: 'publish',
      revision: shared.revision,
      card: { category: 'profile', data: { displayName: 'Replay', about: '' } },
      hours: 1,
      confirmed: true,
    }),
  ).rejects.toMatchObject({ statusCode: 409 });
});
it('fences simultaneous delete/edit requests and rejects replay after new content is saved', async () => {
  const saved = await tasks.mutatePersonalTasks('owner-a', { action: 'save', revision: null, task: task() });
  const results = await Promise.allSettled([
    tasks.erasePersonalTasks('owner-a', saved.revision),
    tasks.mutatePersonalTasks('owner-a', { action: 'save', revision: saved.revision, task: task() }),
  ]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const current = await tasks.readPersonalTasks('owner-a');
  const cleared = await tasks.erasePersonalTasks('owner-a', current.revision);
  const newer = await tasks.mutatePersonalTasks('owner-a', {
    action: 'save',
    revision: cleared.revision,
    task: task(),
  });
  await expect(tasks.erasePersonalTasks('owner-a', saved.revision)).rejects.toMatchObject({ statusCode: 409 });
  expect(await tasks.readPersonalTasks('owner-a')).toEqual(newer);
});
it('creates empty revision fences even when records were absent and never revives a null-revision draft', async () => {
  const empty = await tasks.erasePersonalTasks('owner-a', null);
  expect(empty.revision).toBeTruthy();
  expect(empty.tasks).toEqual(emptyTasks().tasks);
  await expect(
    tasks.mutatePersonalTasks('owner-a', { action: 'save', revision: null, task: task() }),
  ).rejects.toMatchObject({ statusCode: 409 });
  const shared = await privacy.erasePrivacy('owner-a', null);
  expect(shared.revision).toBeTruthy();
  await expect(privacy.erasePrivacy('owner-a', null)).rejects.toMatchObject({ statusCode: 409 });
});
it('fails closed on corrupt records and routing ownership without silently overwriting content', async () => {
  const key = tasks.personalTasksKey('owner-a');
  await direct.set(key, '{corrupt');
  await expect(tasks.erasePersonalTasks('owner-a', null)).rejects.toMatchObject({ statusCode: 503 });
  expect(await direct.get(key)).toBe('{corrupt');
  const shared = await privacy.mutatePrivacy('owner-a', {
    action: 'save-draft',
    revision: null,
    card: { category: 'profile', data: { displayName: 'Keep', about: 'Do not overwrite' } },
  });
  const before = await direct.get(privacy.privacyOwnerKey('owner-a'));
  await direct.set(privacy.privacyLinkKey(shared.shareId!), 'f'.repeat(64));
  await expect(privacy.erasePrivacy('owner-a', shared.revision)).rejects.toMatchObject({ statusCode: 503 });
  expect(await direct.get(privacy.privacyOwnerKey('owner-a'))).toBe(before);
});
