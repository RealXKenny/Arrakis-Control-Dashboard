import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  assistanceAlerts,
  helpRequestView,
  volunteerInputSchema,
  type HelpRequest,
} from '../../../src/features/assistance/model';
import { inboxAlertSchema } from '../../../src/features/inbox/model';

const request: HelpRequest = {
  id: randomUUID(),
  owner: 'private-requester',
  requesterName: 'New player',
  title: 'Need a stillsuit',
  details: 'Where can I craft my first stillsuit?',
  category: 'getting-started',
  status: 'assigned',
  volunteerOwner: 'private-volunteer',
  volunteerName: 'Guide',
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
  assignedAt: '2026-11-15T00:00:00Z',
  resolvedAt: null,
  requesterReadAt: null,
  volunteerReadAt: null,
  abuse: { reporter: 'private-reporter', reason: 'private report reason', at: '2026-11-15T00:00:00Z' },
  revision: randomUUID(),
};

it('hides assigned requests and abuse details from other members and owner IDs from every view', () => {
  expect(helpRequestView(request, 'stranger')).toBeNull();
  const own = helpRequestView(request, 'private-requester');
  expect(own).toMatchObject({ isRequester: true, volunteerName: 'Guide', abuseReported: true });
  expect(JSON.stringify(own)).not.toMatch(/private-requester|private-volunteer|private-reporter|private report reason/);
  expect(helpRequestView({ ...request, status: 'open' }, 'stranger')).toMatchObject({
    requesterName: 'New player',
    volunteerName: null,
  });
});

it('alerts only participants with active assignments and validates availability', () => {
  const alerts = assistanceAlerts(
    [request, { ...request, id: randomUUID(), owner: 'other', volunteerOwner: null }],
    'private-requester',
  );
  expect(alerts).toHaveLength(1);
  expect(inboxAlertSchema.safeParse({ ...alerts[0], id: 'a'.repeat(64) }).success).toBe(true);
  expect(assistanceAlerts([{ ...request, status: 'resolved' }], 'private-requester')).toEqual([]);
  expect(volunteerInputSchema.safeParse({ available: true, categories: [], note: '', revision: null }).success).toBe(
    false,
  );
  expect(
    volunteerInputSchema.safeParse({ available: true, categories: ['getting-started'], note: '', revision: null })
      .success,
  ).toBe(true);
});
