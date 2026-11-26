import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HelpRequest } from '../../../src/features/assistance/model';
import { assistanceModerationCase, moderationCaseView, reporterCaseView } from '../../../src/features/moderation/model';

const request: HelpRequest = {
  id: randomUUID(),
  owner: 'private-requester',
  requesterName: 'Requester',
  title: 'Help request',
  details: 'Private assistance details',
  category: 'getting-started',
  status: 'resolved',
  volunteerOwner: 'private-volunteer',
  volunteerName: 'Guide',
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
  assignedAt: '2026-11-15T00:00:00Z',
  resolvedAt: null,
  requesterReadAt: null,
  volunteerReadAt: null,
  abuse: { reporter: 'private-reporter', reason: 'Evidence of abuse', at: '2026-11-15T00:00:00Z' },
  revision: randomUUID(),
};

it('derives bounded assistance evidence while removing account IDs from views', () => {
  const record = assistanceModerationCase(request)!;
  expect(record.type).toBe('assistance-abuse');
  expect(record.evidence).toContain('Evidence of abuse');
  const moderator = moderationCaseView(record);
  expect(JSON.stringify(moderator)).not.toMatch(/private-requester|private-volunteer|private-reporter/);
  const reporter = reporterCaseView(record);
  expect(reporter).not.toHaveProperty('evidence');
  expect(reporter).not.toHaveProperty('history');
  expect(assistanceModerationCase({ ...request, abuse: null })).toBeNull();
});
