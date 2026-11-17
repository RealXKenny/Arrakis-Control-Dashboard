import type { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { configureApplication, connectDirect, integrationTarget } from './helpers/redis-target';
import type { HelpRequest, HelpVolunteer } from '../../src/features/assistance/model';

const target = integrationTarget();
configureApplication(target);
let direct: Redis;
let requests: typeof import('../../src/features/assistance/server/requests-store');
let volunteers: typeof import('../../src/features/assistance/server/volunteers-store');
let messages: typeof import('../../src/features/assistance/server/messages-store');
let guide: HelpVolunteer;
let request: HelpRequest;

beforeAll(async () => {
  direct = connectDirect(target);
  requests = await import('../../src/features/assistance/server/requests-store');
  volunteers = await import('../../src/features/assistance/server/volunteers-store');
  messages = await import('../../src/features/assistance/server/messages-store');
});
beforeEach(async () => {
  await direct.flushdb();
  guide = await volunteers.saveVolunteer(
    { available: true, categories: ['getting-started'], note: 'First steps', revision: null },
    'guide',
    'Guide',
  );
  request = await requests.createHelpRequest(
    { title: 'First stillsuit', category: 'getting-started', details: 'Please help me craft a stillsuit.' },
    'new-player',
    'New player',
  );
});
afterAll(async () => {
  await direct.quit();
  (globalThis as { arrakisRedisClient?: { close(): void } }).arrakisRedisClient?.close();
});

it('runs assignment, lifecycle, private chat, reporting and active-slot release', async () => {
  await expect(
    requests.createHelpRequest(
      { title: request.title, category: request.category, details: request.details },
      'new-player',
      'New player',
    ),
  ).rejects.toMatchObject({ code: 'ASSISTANCE_DUPLICATE' });
  await expect(requests.claimHelpRequest(request.id, request.revision, guide)).resolves.toMatchObject({
    request: { status: 'assigned', volunteerOwner: 'guide' },
  });
  const assigned = (await requests.readHelpRequests())[0];
  const marked = await requests.mutateHelpRequest(
    request.id,
    { action: 'read', revision: crypto.randomUUID() },
    'new-player',
  );
  expect(marked.request.revision).toBe(assigned.revision);
  await expect(
    volunteers.saveVolunteer(
      { available: false, categories: ['getting-started'], note: '', revision: guide.revision },
      'guide',
      'Guide',
    ),
  ).rejects.toMatchObject({ statusCode: 409 });
  const sent = await messages.sendHelpMessage(assigned, { body: 'Start at the crafting station.' }, 'guide', 'Guide');
  expect(sent.body).toContain('crafting');
  expect(await messages.readHelpMessages(assigned, 'new-player')).toHaveLength(1);
  await expect(messages.readHelpMessages(assigned, 'stranger')).rejects.toMatchObject({ statusCode: 403 });
  const started = await requests.mutateHelpRequest(
    request.id,
    { action: 'start', revision: assigned.revision },
    'new-player',
  );
  const resolved = await requests.mutateHelpRequest(
    request.id,
    { action: 'resolve', revision: started.request.revision },
    'guide',
  );
  expect(resolved.request.status).toBe('resolved');
  expect((await volunteers.readVolunteer('guide')).activeRequestId).toBeNull();
  const reported = await requests.mutateHelpRequest(
    request.id,
    { action: 'report', revision: resolved.request.revision, reason: 'Please review this interaction.' },
    'new-player',
  );
  expect(reported.request.abuse?.reason).toBe('Please review this interaction.');
  await requests.mutateHelpRequest(request.id, { action: 'close', revision: reported.request.revision }, 'new-player');
});

it('allows exactly one winner when two volunteers claim the same request', async () => {
  const other = await volunteers.saveVolunteer(
    { available: true, categories: ['getting-started'], note: '', revision: null },
    'other-guide',
    'Other guide',
  );
  const results = await Promise.allSettled([
    requests.claimHelpRequest(request.id, request.revision, guide),
    requests.claimHelpRequest(request.id, request.revision, other),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  const assigned = (await requests.readHelpRequests())[0];
  expect(assigned.status).toBe('assigned');
  const winner = assigned.volunteerOwner!;
  const loser = winner === 'guide' ? other : guide;
  expect(loser.activeRequestId).toBeNull();
  const resolved = await requests.mutateHelpRequest(
    request.id,
    { action: 'resolve', revision: assigned.revision },
    winner,
  );
  expect(resolved.request.status).toBe('resolved');
  expect((await volunteers.readVolunteer(winner)).activeRequestId).toBeNull();
});
