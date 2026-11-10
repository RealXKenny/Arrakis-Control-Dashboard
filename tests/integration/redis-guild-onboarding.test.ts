import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { guildKeys } from '../../src/lib/redis/keys';
import { onboardingKey } from '../../src/features/guilds/server/onboarding-access';
import type { OnboardingActor } from '../../src/features/guilds/server/onboarding-access';
import type { OnboardingBook } from '../../src/features/guilds/onboarding';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let store: typeof import('../../src/features/guilds/server/onboarding-store');
const roster = ['leader', 'recruit', 'mentor'].map((id) => ({ key: onboardingKey('2', id), name: id }));
const actor = (id = 'recruit'): OnboardingActor => ({
  memberKey: onboardingKey('2', id),
  canEdit: id === 'leader',
  roster,
});
const guide = () => ({
  welcome: 'Welcome',
  rules: 'Ask before taking supplies',
  locations: 'South base',
  steps: [
    { id: randomUUID(), text: 'Meet your mentor' },
    { id: randomUUID(), text: 'Tour the base' },
  ],
});
const create = () => store.mutateOnboarding('2', { action: 'guide', revision: null, guide: guide() }, actor('leader'));
beforeAll(async () => {
  direct = connectDirect(target);
  store = await import('../../src/features/guilds/server/onboarding-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

describe('recruit onboarding Redis storage', () => {
  it('isolates guilds, bounds retention and never extends retention on reads', async () => {
    const book = await create();
    expect(book.rulesRevision).toBeTruthy();
    expect((await store.readOnboarding('3')).guide.welcome).toBe('');
    expect(await direct.ttl(guildKeys.onboarding('2'))).toBeGreaterThan(7_775_990);
    await direct.expire(guildKeys.onboarding('2'), 60);
    await store.readOnboarding('2');
    expect(await direct.ttl(guildKeys.onboarding('2'))).toBeLessThanOrEqual(60);
  });
  it('restricts guide/mentor/removal to leaders and progress to the session character', async () => {
    let book = await create();
    for (const input of [
      { action: 'guide' as const, revision: book.revision, guide: book.guide },
      { action: 'mentor' as const, revision: book.revision, memberKey: roster[1].key, mentorKey: roster[2].key },
      { action: 'remove-progress' as const, revision: book.revision, memberKey: roster[1].key },
    ])
      await expect(store.mutateOnboarding('2', input, actor())).rejects.toMatchObject({ statusCode: 403 });
    book = await store.mutateOnboarding(
      '2',
      { action: 'complete', revision: book.revision, stepId: book.guide.steps[0].id, completed: true },
      actor(),
    );
    expect(book.members[0].memberKey).toBe(roster[1].key);
    await expect(
      store.mutateOnboarding('2', { action: 'acknowledge-rules', revision: book.revision }, { ...actor(), roster: [] }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });
  it('preserves unaffected progress, resets changed steps/rules and permits undo', async () => {
    let book = await create();
    book = await store.mutateOnboarding(
      '2',
      { action: 'complete', revision: book.revision, stepId: book.guide.steps[0].id, completed: true },
      actor(),
    );
    book = await store.mutateOnboarding('2', { action: 'acknowledge-rules', revision: book.revision }, actor());
    const oldRules = book.rulesRevision;
    book = await store.mutateOnboarding(
      '2',
      { action: 'guide', revision: book.revision, guide: { ...book.guide, welcome: 'Updated welcome' } },
      actor('leader'),
    );
    expect(book.members[0].completed).toHaveLength(1);
    expect(book.members[0].rulesRevision).toBe(book.rulesRevision);
    book = await store.mutateOnboarding(
      '2',
      {
        action: 'guide',
        revision: book.revision,
        guide: {
          ...book.guide,
          rules: 'New rules',
          steps: book.guide.steps.map((step, index) =>
            index === 0 ? { ...step, text: 'Read the revised tour' } : step,
          ),
        },
      },
      actor('leader'),
    );
    expect(book.members[0].completed).toEqual([]);
    expect(book.rulesRevision).not.toBe(oldRules);
    expect(book.members[0].rulesRevision).not.toBe(book.rulesRevision);
    book = await store.mutateOnboarding(
      '2',
      { action: 'complete', revision: book.revision, stepId: book.guide.steps[0].id, completed: true },
      actor(),
    );
    book = await store.mutateOnboarding(
      '2',
      { action: 'complete', revision: book.revision, stepId: book.guide.steps[0].id, completed: false },
      actor(),
    );
    expect(book.members[0].completed).toEqual([]);
  });
  it('validates current mentor/target membership, refuses self-mentoring and clears assignments', async () => {
    let book = await create();
    for (const mentorKey of [roster[1].key, onboardingKey('2', 'departed')])
      await expect(
        store.mutateOnboarding(
          '2',
          { action: 'mentor', revision: book.revision, memberKey: roster[1].key, mentorKey },
          actor('leader'),
        ),
      ).rejects.toMatchObject({ code: 'ONBOARDING_MEMBER_CHANGED' });
    book = await store.mutateOnboarding(
      '2',
      { action: 'mentor', revision: book.revision, memberKey: roster[1].key, mentorKey: roster[2].key },
      actor('leader'),
    );
    expect(store.onboardingView(book, actor()).self?.mentorName).toBe('mentor');
    expect(store.onboardingView(book, { ...actor(), roster: roster.slice(0, 2) }).self?.mentorName).toBeNull();
    book = await store.mutateOnboarding(
      '2',
      { action: 'mentor', revision: book.revision, memberKey: roster[1].key, mentorKey: null },
      actor('leader'),
    );
    expect(book.members[0].mentorKey).toBeNull();
    book = await store.mutateOnboarding(
      '2',
      { action: 'remove-progress', revision: book.revision, memberKey: roster[1].key },
      actor('leader'),
    );
    expect(book.members).toEqual([]);
  });
  it('serializes concurrent progress and rejects stale writes rather than losing another member update', async () => {
    const book = await create();
    const results = await Promise.allSettled(
      ['recruit', 'mentor'].map((id) =>
        store.mutateOnboarding(
          '2',
          { action: 'complete', revision: book.revision, stepId: book.guide.steps[0].id, completed: true },
          actor(id),
        ),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect((await store.readOnboarding('2')).members).toHaveLength(1);
    await expect(
      store.mutateOnboarding('2', { action: 'guide', revision: book.revision, guide: book.guide }, actor('leader')),
    ).rejects.toMatchObject({ code: 'ONBOARDING_CONFLICT' });
  });
  it('enforces the final progress slot atomically', async () => {
    const book: OnboardingBook = await create();
    book.members = Array.from({ length: 199 }, (_, index) => ({
      memberKey: onboardingKey('2', `old-${index}`),
      memberName: 'Former member',
      mentorKey: null,
      completed: [],
      rulesRevision: null,
      updatedAt: new Date().toISOString(),
    }));
    await direct.set(guildKeys.onboarding('2'), JSON.stringify(book));
    const results = await Promise.allSettled(
      ['recruit', 'mentor'].map((id) =>
        store.mutateOnboarding('2', { action: 'acknowledge-rules', revision: book.revision }, actor(id)),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const current = await store.readOnboarding('2');
    expect(current.members).toHaveLength(200);
    await expect(
      store.mutateOnboarding('2', { action: 'acknowledge-rules', revision: current.revision }, actor('leader')),
    ).rejects.toMatchObject({ code: 'ONBOARDING_FULL' });
  });
  it('fails closed on corrupt/oversized records and clears onboarding on dashboard disband', async () => {
    for (const raw of ['invalid-json', 'x'.repeat(262_145)]) {
      await direct.set(guildKeys.onboarding('2'), raw);
      await expect(store.readOnboarding('2')).rejects.toMatchObject({ code: 'ONBOARDING_UNAVAILABLE' });
    }
    await direct.del(guildKeys.onboarding('2'));
    await create();
    const { removeGuildStorage } = await import('../../src/features/guilds/server/membership');
    await removeGuildStorage('2');
    expect(await direct.exists(guildKeys.onboarding('2'))).toBe(0);
  });
});
