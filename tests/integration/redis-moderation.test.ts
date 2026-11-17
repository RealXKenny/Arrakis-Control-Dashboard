import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import { moderationKeys } from '../../src/lib/redis/keys';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let cases: typeof import('../../src/features/moderation/server/cases-store');
let assistance: typeof import('../../src/features/assistance/server/requests-store');

beforeAll(async () => {
  direct = connectDirect(target);
  cases = await import('../../src/features/moderation/server/cases-store');
  assistance = await import('../../src/features/assistance/server/requests-store');
});
beforeEach(async () => {
  await direct.flushdb();
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

const input = {
  subjectName: 'Reported player',
  summary: 'Verifiable report summary',
  evidence: 'Verifiable report evidence',
};
const moderator = { owner: 'moderator', name: 'Moderator' };

it('supports assignment, decisions, closure and bounded history with stale-write protection', async () => {
  const created = await cases.createPlayerReport(input, 'reporter', 'Reporter');
  const assigned = await cases.mutateModerationCase(
    created.id,
    { action: 'assign', revision: created.revision },
    moderator,
  );
  expect(assigned).toMatchObject({ status: 'assigned', assigneeOwner: 'moderator' });
  await expect(
    cases.mutateModerationCase(created.id, { action: 'assign', revision: created.revision }, moderator),
  ).rejects.toMatchObject({
    statusCode: 409,
  });
  const outcomes = await Promise.allSettled([
    cases.mutateModerationCase(
      created.id,
      { action: 'decide', revision: assigned.revision, decision: 'confirmed', reason: 'Evidence confirmed' },
      moderator,
    ),
    cases.mutateModerationCase(
      created.id,
      { action: 'decide', revision: assigned.revision, decision: 'dismissed', reason: 'Evidence dismissed' },
      { owner: 'other', name: 'Other' },
    ),
  ]);
  expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  const resolved = outcomes.find((result) => result.status === 'fulfilled')!.value;
  const closed = await cases.mutateModerationCase(
    created.id,
    { action: 'close', revision: resolved.revision },
    moderator,
  );
  expect(closed.status).toBe('closed');
  expect(closed.history.map((item) => item.action)).toEqual(['reported', 'assign', 'decide', 'close']);
  expect(await direct.ttl(moderationKeys.cases)).toBeGreaterThan(89 * 86400);
});

it('creates an assistance evidence snapshot on the first moderator action', async () => {
  const request = await assistance.createHelpRequest(
    { title: 'Assistance report', category: 'getting-started', details: 'Private request details' },
    'requester',
    'Requester',
  );
  await assistance.mutateHelpRequest(
    request.id,
    { action: 'report', revision: request.revision, reason: 'Reported assistance abuse' },
    'requester',
  );
  const [derived] = await cases.readModerationCases();
  expect(derived).toMatchObject({
    type: 'assistance-abuse',
    status: 'open',
    evidence: expect.stringContaining('Reported assistance abuse'),
  });
  const assigned = await cases.mutateModerationCase(
    derived.id,
    { action: 'assign', revision: derived.revision },
    moderator,
  );
  expect(assigned.status).toBe('assigned');
  const resolved = await cases.mutateModerationCase(
    derived.id,
    {
      action: 'decide',
      revision: assigned.revision,
      decision: 'dismissed',
      reason: 'Reviewed and dismissed',
    },
    moderator,
  );
  expect(resolved.decision).toBe('dismissed');
  expect(resolved.history.length).toBeGreaterThan(1);
});
