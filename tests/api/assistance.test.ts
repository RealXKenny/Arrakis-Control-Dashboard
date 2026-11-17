import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { HelpRequest, HelpVolunteer } from '../../src/features/assistance/model';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  requests: vi.fn(),
  volunteer: vi.fn(),
  create: vi.fn(),
  messages: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/assistance/server/requests-store', () => ({
  readHelpRequests: mocks.requests,
  createHelpRequest: mocks.create,
  claimHelpRequest: vi.fn(),
  mutateHelpRequest: vi.fn(),
}));
vi.mock('../../src/features/assistance/server/volunteers-store', () => ({
  readVolunteer: mocks.volunteer,
  saveVolunteer: vi.fn(),
}));
vi.mock('../../src/features/assistance/server/messages-store', () => ({
  readHelpMessages: mocks.messages,
  sendHelpMessage: vi.fn(),
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL', APP_URL: 'https://dashboard.test' }),
}));

import { GET, POST } from '../../src/app/api/v2/assistance/route';
import { GET as MESSAGES } from '../../src/app/api/v2/assistance/[requestId]/messages/route';

const request: HelpRequest = {
  id: randomUUID(),
  owner: 'member',
  requesterName: 'Member',
  title: 'Need guidance',
  details: 'Please help me find the first crafting station.',
  category: 'getting-started',
  status: 'assigned',
  volunteerOwner: 'guide',
  volunteerName: 'Guide',
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
  assignedAt: '2026-11-15T00:00:00Z',
  resolvedAt: null,
  requesterReadAt: null,
  volunteerReadAt: null,
  abuse: null,
  revision: randomUUID(),
};
const volunteer: HelpVolunteer = {
  owner: 'member',
  displayName: 'Member',
  available: true,
  categories: ['getting-started'],
  note: '',
  activeRequestId: null,
  revision: null,
  updatedAt: null,
};
const session = {
  user: { id: 'member', username: 'Member' },
  guildId: 'guild',
  roleIds: ['member'],
  authenticatedAt: Date.now(),
  expiresAt: Date.now() + 60000,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue(session);
  mocks.requests.mockResolvedValue([
    request,
    { ...request, id: randomUUID(), owner: 'other', volunteerOwner: 'other-guide' },
  ]);
  mocks.volunteer.mockResolvedValue(volunteer);
  mocks.limit.mockResolvedValue({ allowed: true, storageUnavailable: false });
  mocks.messages.mockResolvedValue([
    { id: randomUUID(), owner: 'guide', authorName: 'Guide', body: 'Private reply', sentAt: '2026-11-15T00:00:00Z' },
  ]);
});

it('shows only open or participant requests and strips owner IDs', async () => {
  const response = await GET(new Request('https://dashboard.test'));
  const body = await response.json();
  expect(body.requests).toHaveLength(1);
  expect(body.requests[0].isRequester).toBe(true);
  expect(JSON.stringify(body)).not.toContain('"owner"');
  expect(JSON.stringify(body)).not.toContain('other-guide');
});

it('rejects cross-origin creation before writing and returns private messages without owner IDs', async () => {
  const created = await POST(
    new Request('https://dashboard.test/api/v2/assistance', {
      method: 'POST',
      headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Need help', category: 'getting-started', details: 'Cross origin request' }),
    }),
  );
  expect(created.status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
  const response = await MESSAGES(new Request('https://dashboard.test'), {
    params: Promise.resolve({ requestId: request.id }),
  });
  const body = await response.json();
  expect(body.messages[0]).toMatchObject({ authorName: 'Guide', body: 'Private reply', isOwn: false });
  expect(JSON.stringify(body)).not.toContain('"owner"');
});
