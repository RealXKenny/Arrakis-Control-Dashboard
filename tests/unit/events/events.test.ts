import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstCommunityEvent, eventInputSchema } from '../../../src/features/events/contracts';
const redis = vi.hoisted(() => ({ eval: vi.fn(), command: vi.fn() }));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => redis }));
import {
  listCommunityEvents,
  saveCommunityEvent,
  deleteCommunityEvent,
} from '../../../src/features/events/server/store';
const seed = firstCommunityEvent('2026-11-08T20:00:00.000Z');
beforeEach(() => {
  vi.clearAllMocks();
  redis.eval.mockImplementation(async (script: string) =>
    script.includes('community-events:initialize') ? ['__seeded', '1', seed.id, JSON.stringify(seed)] : 'ok',
  );
  redis.command.mockResolvedValue(JSON.stringify(seed));
});
describe('community events', () => {
  it('announces the requested competition and exact known prizes without inventing a date', () => {
    expect(seed).toMatchObject({
      title: 'Base Building Competition',
      prizeSolaris: 500000,
      visibility: 'published',
      status: 'upcoming',
      startsAt: null,
      endsAt: null,
    });
    expect(seed.prizeItems).toContain('new in-game items');
    expect(seed.participation).toContain('will be announced');
  });
  it('validates prize amounts, sizes and date ordering before persistence', () => {
    expect(eventInputSchema.safeParse({ ...seed, prizeSolaris: -1 }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...seed, prizeSolaris: 1.5 }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...seed, title: 'x'.repeat(121) }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...seed, startsAt: '2026-12-02T12:00:00.000Z', endsAt: '2026-12-01T12:00:00.000Z' })
        .success,
    ).toBe(false);
    expect(eventInputSchema.parse(seed)).not.toHaveProperty('revision');
  });
  it('filters drafts and malformed or mis-keyed records at the storage boundary', async () => {
    const draft = { ...seed, id: 'private-event', visibility: 'draft' };
    redis.eval.mockResolvedValue([
      '__seeded',
      '1',
      seed.id,
      JSON.stringify(seed),
      draft.id,
      JSON.stringify(draft),
      'wrong-id',
      JSON.stringify(seed),
      'bad',
      '{',
    ]);
    expect((await listCommunityEvents()).map((event) => event.id)).toEqual([seed.id]);
    expect((await listCommunityEvents(true)).map((event) => event.id)).toEqual([seed.id, draft.id]);
  });
  it('saves edits with an atomic revision check and preserves the creation time', async () => {
    const event = await saveCommunityEvent(seed.id, { ...seed, title: 'Updated competition' }, 1);
    expect(event).toMatchObject({ revision: 2, createdAt: seed.createdAt, title: 'Updated competition' });
    expect(redis.eval.mock.calls[1][1]).toEqual(['arrakis:{community-events}:records']);
    expect(redis.eval.mock.calls[1][2]).toEqual([seed.id, 1, JSON.stringify(event), 'put', 50]);
  });
  it.each([
    ['conflict', 409],
    ['full', 409],
    ['missing', 404],
  ])('surfaces %s without silently overwriting another edit', async (result, status) => {
    redis.eval.mockImplementation(async (script: string) =>
      script.includes('community-events:initialize') ? [] : result,
    );
    await expect(saveCommunityEvent(seed.id, seed, 1)).rejects.toMatchObject({ statusCode: status });
  });
  it('requires the revision when deleting and does not delete the initialization marker', async () => {
    await deleteCommunityEvent(seed.id, 1);
    const [script, keys, args] = redis.eval.mock.calls[1];
    expect(keys).toEqual(['arrakis:{community-events}:records']);
    expect(args).toEqual([seed.id, 1, '', 'delete', 50]);
    expect(script).toContain("redis.call('HDEL', KEYS[1], ARGV[1])");
    expect(script).not.toContain("redis.call('DEL'");
  });
});
