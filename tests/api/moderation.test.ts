import { beforeEach, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  moderator: vi.fn(),
  cases: vi.fn(),
  reports: vi.fn(),
  create: vi.fn(),
  mutate: vi.fn(),
  limit: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/moderation/server/authorization', () => ({ isModerator: mocks.moderator }));
vi.mock('../../src/features/moderation/server/cases-store', () => ({
  readModerationCases: mocks.cases,
  readReporterCases: mocks.reports,
  createPlayerReport: mocks.create,
  mutateModerationCase: mocks.mutate,
}));
vi.mock('../../src/lib/security/rate-limit', () => ({ checkRateLimit: mocks.limit }));
vi.mock('../../src/lib/security/audit', () => ({ recordAudit: mocks.audit }));
vi.mock('../../src/config/env', () => ({
  getServerEnv: () => ({ NODE_ENV: 'test', LOG_LEVEL: 'FATAL', APP_URL: 'https://dashboard.test' }),
}));

import { GET as CASES } from '../../src/app/api/v2/moderation/cases/route';
import { POST as ACTION } from '../../src/app/api/v2/moderation/cases/[caseId]/route';
import { GET, POST } from '../../src/app/api/v2/reports/route';

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
  mocks.moderator.mockResolvedValue(false);
  mocks.limit.mockResolvedValue({ allowed: true, storageUnavailable: false });
  mocks.reports.mockResolvedValue([]);
});

it('denies case reads and actions before loading evidence when moderator verification fails', async () => {
  expect((await CASES(new Request('https://dashboard.test'))).status).toBe(403);
  const response = await ACTION(
    new Request('https://dashboard.test', {
      method: 'POST',
      headers: { Origin: 'https://dashboard.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assign', revision: randomUUID() }),
    }),
    { params: Promise.resolve({ caseId: randomUUID() }) },
  );
  expect(response.status).toBe(403);
  expect(mocks.cases).not.toHaveBeenCalled();
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it('rejects cross-origin public reports before writing', async () => {
  const response = await POST(
    new Request('https://dashboard.test/api/v2/reports', {
      method: 'POST',
      headers: { Origin: 'https://attacker.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjectName: 'Player', summary: 'Report summary', evidence: 'Report evidence' }),
    }),
  );
  expect(response.status).toBe(403);
  expect(mocks.create).not.toHaveBeenCalled();
});

it('returns only the caller’s bounded report status', async () => {
  const response = await GET(new Request('https://dashboard.test'));
  expect(response.status).toBe(200);
  expect(mocks.reports).toHaveBeenCalledWith('member');
  expect(await response.json()).toEqual({ ok: true, reports: [] });
});
