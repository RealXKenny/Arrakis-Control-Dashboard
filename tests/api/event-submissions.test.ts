import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { firstCommunityEvent } from '../../src/features/events/contracts';
import type { EventSubmission } from '../../src/features/events/submissions';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  list: vi.fn(),
  records: vi.fn(),
  review: vi.fn(),
  reviewer: vi.fn(),
  image: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/events/server/store', () => ({ listCommunityEvents: mocks.list }));
vi.mock('../../src/features/events/server/submissions-store', () => ({
  readEventSubmissions: mocks.records,
  reviewEventSubmission: mocks.review,
  readSubmissionImage: mocks.image,
  saveEventSubmission: vi.fn(),
  withdrawEventSubmission: vi.fn(),
}));
vi.mock('../../src/features/events/server/review-authorization', () => ({
  canReviewEventSubmissions: mocks.reviewer,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL', APP_URL: 'https://dashboard.test' }),
}));

import { GET } from '../../src/app/api/v2/events/[eventId]/submissions/route';
import { POST } from '../../src/app/api/v2/events/[eventId]/submissions/[submissionId]/route';
import { GET as IMAGE } from '../../src/app/api/v2/events/[eventId]/submissions/[submissionId]/image/route';

const event = firstCommunityEvent();
const ownerRecord: EventSubmission = {
  id: randomUUID(),
  owner: 'member',
  authorName: 'Member',
  title: 'Own pending',
  note: 'Private pending evidence',
  status: 'pending',
  reviewNote: null,
  result: null,
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
  reviewedAt: null,
  judgedAt: null,
  revision: randomUUID(),
  imageVersion: randomUUID(),
};
const otherPending = { ...ownerRecord, id: randomUUID(), owner: 'other', title: 'Other pending' };
const otherApproved = {
  ...ownerRecord,
  id: randomUUID(),
  owner: 'other',
  status: 'approved' as const,
  title: 'Public entry',
};
const session = {
  user: { id: 'member', username: 'Member' },
  guildId: 'guild',
  roleIds: ['member'],
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};
const collection = { params: Promise.resolve({ eventId: event.id }) };
const item = { params: Promise.resolve({ eventId: event.id, submissionId: ownerRecord.id }) };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.list.mockResolvedValue([event]);
  mocks.records.mockResolvedValue([ownerRecord, otherPending, otherApproved]);
  mocks.reviewer.mockResolvedValue(false);
  mocks.limit.mockResolvedValue({ allowed: true, storageUnavailable: false });
  mocks.image.mockResolvedValue(Buffer.from('RIFF0000WEBP'));
});

it('shows only approved entries and the caller’s own pending entry without owner IDs', async () => {
  const response = await GET(new Request('https://dashboard.test'), collection);
  const body = await response.json();
  expect(body.submissions.map((entry: { title: string }) => entry.title)).toEqual(['Own pending', 'Public entry']);
  expect(JSON.stringify(body)).not.toContain('"owner"');
  expect(body.submissions[0].revision).toBe(ownerRecord.revision);
  expect(body.submissions[1].revision).toBeUndefined();
});

it('requires fresh reviewer authorization for judging actions', async () => {
  const response = await POST(
    new Request('https://dashboard.test', {
      method: 'POST',
      headers: { Origin: 'https://dashboard.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'judge', revision: ownerRecord.revision, result: 'winner' }),
    }),
    item,
  );
  expect(response.status).toBe(403);
  expect(mocks.review).not.toHaveBeenCalled();
});

it('allows only the owner or reviewer to read a pending image', async () => {
  expect((await IMAGE(new Request('https://dashboard.test'), item)).status).toBe(200);
  mocks.session.mockResolvedValue({ ...session, user: { id: 'stranger', username: 'Stranger' } });
  expect((await IMAGE(new Request('https://dashboard.test'), item)).status).toBe(404);
});
