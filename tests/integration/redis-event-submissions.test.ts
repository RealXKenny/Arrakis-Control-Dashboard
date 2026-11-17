import type { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { communityEventKeys } from '../../src/lib/redis/keys';
import type { CommunityEvent } from '../../src/features/events/contracts';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let events: typeof import('../../src/features/events/server/store');
let submissions: typeof import('../../src/features/events/server/submissions-store');
let event: CommunityEvent;
const image = { bytes: Buffer.from('RIFF0000WEBP'), version: randomUUID() };
const draft = { title: 'Desert residence', note: 'Detailed evidence for the build.' };

beforeAll(async () => {
  direct = connectDirect(target);
  events = await import('../../src/features/events/server/store');
  submissions = await import('../../src/features/events/server/submissions-store');
});
beforeEach(async () => {
  await direct.flushdb();
  const [seed] = await events.listCommunityEvents();
  event = await events.saveCommunityEvent(
    seed.id,
    {
      ...seed,
      startsAt: new Date(Date.now() - 3600000).toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'open',
    },
    seed.revision,
  );
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

it('enforces ownership, editing, review and separate single-winner judging atomically', async () => {
  const first = await submissions.saveEventSubmission(event, draft, 'owner-a', 'Builder A', image);
  const second = await submissions.saveEventSubmission(event, draft, 'owner-b', 'Builder B', image);
  expect(first).toMatchObject({ status: 'pending', result: null });
  await expect(submissions.saveEventSubmission(event, draft, 'owner-a', 'Builder A', image)).rejects.toMatchObject({
    code: 'SUBMISSION_DUPLICATE',
  });
  await expect(
    submissions.saveEventSubmission(
      event,
      { ...draft, id: first.id, revision: first.revision },
      'owner-b',
      'Builder B',
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
  const edited = await submissions.saveEventSubmission(
    event,
    { ...draft, id: first.id, revision: first.revision, title: 'Edited residence' },
    'owner-a',
    'Builder A',
  );
  expect(edited.title).toBe('Edited residence');
  const approvedA = await submissions.reviewEventSubmission(event, first.id, {
    action: 'review',
    revision: edited.revision,
    status: 'approved',
    note: 'Meets the rules',
  });
  const approvedB = await submissions.reviewEventSubmission(event, second.id, {
    action: 'review',
    revision: second.revision,
    status: 'approved',
    note: '',
  });
  await expect(
    submissions.reviewEventSubmission(event, first.id, {
      action: 'judge',
      revision: approvedA.revision,
      result: 'winner',
    }),
  ).rejects.toMatchObject({ code: 'SUBMISSION_CLOSED' });
  const judging = await events.saveCommunityEvent(event.id, { ...event, status: 'judging' }, event.revision);
  const winner = await submissions.reviewEventSubmission(judging, first.id, {
    action: 'judge',
    revision: approvedA.revision,
    result: 'winner',
  });
  expect(winner.result).toBe('winner');
  expect(winner.judgedAt).not.toBeNull();
  await expect(
    submissions.reviewEventSubmission(judging, second.id, {
      action: 'judge',
      revision: approvedB.revision,
      result: 'winner',
    }),
  ).rejects.toMatchObject({ code: 'WINNER_CONFLICT' });
  await expect(
    submissions.withdrawEventSubmission(judging, first.id, winner.revision, 'owner-a'),
  ).rejects.toMatchObject({
    code: 'SUBMISSION_CLOSED',
  });
  expect(await submissions.readSubmissionImage(event.id, first.id)).toEqual(image.bytes);
  expect(await direct.ttl(communityEventKeys.submissions(event.id))).toBeGreaterThan(89 * 86400);
});
