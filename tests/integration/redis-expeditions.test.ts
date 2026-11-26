import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { emptyPlan } from '../../src/features/expeditions/model';
const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let plans: typeof import('../../src/features/expeditions/server/plan-store');
let rescue: typeof import('../../src/features/expeditions/server/rescue-store');
const card = {
  callSign: 'Paul',
  map: 'DeepDesert' as const,
  x: 1,
  y: 2,
  place: 'Wreck',
  assistance: ['fuel' as const],
  details: '',
};
const withBookmark = () => ({
  ...emptyPlan(),
  bookmarks: [
    { id: '00000000-0000-4000-8000-000000000001', map: 'HaggaBasin' as const, x: 0, y: 0, label: 'A', note: '' },
  ],
});
beforeAll(async () => {
  direct = connectDirect(target);
  plans = await import('../../src/features/expeditions/server/plan-store');
  rescue = await import('../../src/features/expeditions/server/rescue-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('private expedition plan persistence', () => {
  it('isolates account and character with 90-day inactivity retention', async () => {
    const saved = await plans.savePlan('user-a', '202', '101', null, withBookmark());
    expect(await plans.readPlan('user-a', '202', '101')).toEqual(saved);
    expect((await plans.readPlan('user-b', '202', '101')).revision).toBeNull();
    expect((await plans.readPlan('user-a', '202', '909')).revision).toBeNull();
    const key = plans.planKey('user-a', '202', '101');
    expect(key).not.toContain('user-a');
    await direct.expire(key, 10);
    await plans.readPlan('user-a', '202', '101');
    expect(await direct.ttl(key)).toBeGreaterThan(89 * 86400);
  });

  it('lets exactly one concurrent writer win and rejects stale revisions', async () => {
    const saved = await plans.savePlan('user', '202', '101', null, emptyPlan());
    const results = await Promise.allSettled([
      plans.savePlan('user', '202', '101', saved.revision, withBookmark()),
      plans.savePlan('user', '202', '101', saved.revision, emptyPlan()),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    await expect(plans.savePlan('user', '202', '101', saved.revision, emptyPlan())).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(plans.savePlan('user', '202', '101', null, emptyPlan())).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed on corrupt records instead of resetting them', async () => {
    await direct.set(plans.planKey('user', '202', '101'), '{"schemaVersion":1,"revision":null');
    await expect(plans.readPlan('user', '202', '101')).rejects.toMatchObject({ statusCode: 503 });
    await expect(plans.savePlan('user', '202', '101', null, emptyPlan())).rejects.toMatchObject({ statusCode: 503 });
  });
});

describe('rescue request cards', () => {
  it('publishes an expiring unlisted card, replaces it atomically and cancels it', async () => {
    const first = await rescue.publishRescue('user', null, card, 1);
    const firstId = first.active!.shareId;
    expect(await rescue.readSharedRescue(firstId)).toMatchObject({ data: card });
    expect((await rescue.readOwnRescue('user')).active?.tag).toBe(first.active!.tag);
    expect(await rescue.readOwnRescue('someone-else')).toEqual({ active: null });

    await expect(rescue.publishRescue('user', null, card, 2)).rejects.toMatchObject({ statusCode: 409 });
    const second = await rescue.publishRescue('user', first.active!.tag, { ...card, place: 'Ridge' }, 2);
    expect(await rescue.readSharedRescue(firstId)).toBeNull();
    expect(await rescue.readSharedRescue(second.active!.shareId)).toMatchObject({ data: { place: 'Ridge' } });

    await expect(rescue.cancelRescue('user', first.active!.tag)).rejects.toMatchObject({ statusCode: 409 });
    await rescue.cancelRescue('user', second.active!.tag);
    expect(await rescue.readSharedRescue(second.active!.shareId)).toBeNull();
    expect(await rescue.readOwnRescue('user')).toEqual({ active: null });
  });

  it('expires cards by TTL and by an explicit time check', async () => {
    const now = Date.now();
    const published = await rescue.publishRescue('user', null, card, 1, now);
    const keys = await direct.keys('arrakis:{rescue}:v1:*');
    expect(keys).toHaveLength(2);
    for (const key of keys) expect(await direct.ttl(key)).toBeLessThanOrEqual(3600);
    expect(await rescue.readSharedRescue(published.active!.shareId, now + 3_600_001)).toBeNull();
  });
});
