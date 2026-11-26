import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import type { ProjectActor } from '../../src/features/guilds/projects';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/projects-store');
const key = (n: number) => n.toString(16).padStart(64, '0');
const roster = [1, 2, 3].map((n) => ({ key: key(n), name: `Member ${n}` }));
const leader: ProjectActor = { memberKey: key(1), name: 'Member 1', canEdit: true, roster };
const member = (n: number): ProjectActor => ({ memberKey: key(n), name: `Member ${n}`, canEdit: false, roster });
const projectId = randomUUID();
const materialId = randomUUID();
const createProject = (guild = '2') =>
  store.mutateProjects(
    guild,
    {
      action: 'project-save',
      revision: null,
      project: {
        id: projectId,
        name: 'Wall',
        summary: '',
        status: 'active',
        milestones: [],
        materials: [
          {
            id: materialId,
            name: 'Steel',
            unit: 'ingots',
            required: '900719925474099312',
            templateId: null,
            responsibleKey: null,
          },
        ],
      },
    },
    leader,
  );
const publish = (owner: number, quantity: string) =>
  store.mutateProjects(
    '2',
    {
      action: 'stock-save',
      revision: null,
      entry: {
        id: randomUUID(),
        material: 'Steel',
        unit: 'ingots',
        quantity,
        templateId: null,
        location: '',
        note: '',
      },
    },
    member(owner),
  );

beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/projects-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('guild projects Redis storage', () => {
  it('isolates guilds, keeps exact quantities and retains for 90 days without refreshing on reads', async () => {
    await createProject();
    expect((await store.readProjects('2')).projects[0]!.materials[0]!.required).toBe('900719925474099312');
    expect((await store.readProjects('3')).projects).toEqual([]);
    expect(await direct.ttl(guildKeys.projects('2'))).toBeGreaterThan(90 * 86_400 - 10);
    await direct.expire(guildKeys.projects('2'), 60);
    await store.readProjects('2');
    expect(await direct.ttl(guildKeys.projects('2'))).toBeLessThanOrEqual(60);
  });
  it('re-applies unrelated concurrent edits but never double-allocates the same supply', async () => {
    await createProject();
    const { book } = await publish(2, '50');
    const stockId = book.stockpile[0]!.id;
    const revision = book.projects[0]!.revision;
    const reserve = (quantity: string) =>
      store.mutateProjects(
        '2',
        { action: 'reserve', id: projectId, revision, materialId, reservationId: randomUUID(), stockId, quantity },
        leader,
      );
    const [first, second, unrelated] = await Promise.allSettled([reserve('40'), reserve('40'), publish(3, '5')]);
    expect(unrelated.status).toBe('fulfilled');
    expect([first, second].filter((entry) => entry.status === 'fulfilled')).toHaveLength(1);
    const current = await store.readProjects('2');
    expect(current.projects[0]!.reservations).toHaveLength(1);
    expect(current.stockpile).toHaveLength(2);
  });
  it('fails closed on corrupted or foreign records', async () => {
    await direct.hset(guildKeys.projects('2'), 'revision', randomUUID(), 'book', '{"version":1}');
    await expect(store.readProjects('2')).rejects.toMatchObject({ code: 'PROJECTS_UNAVAILABLE' });
    await createProject('4');
    const foreign = await direct.hget(guildKeys.projects('4'), 'book');
    await direct.hset(guildKeys.projects('2'), 'revision', randomUUID(), 'book', foreign!);
    await expect(store.readProjects('2')).rejects.toMatchObject({ code: 'PROJECTS_UNAVAILABLE' });
  });
});
