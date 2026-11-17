import { expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';

const mocks = vi.hoisted(() => ({ role: vi.fn() }));
vi.mock('../../../src/features/auth/server/discord-roles', () => ({ hasDiscordRole: mocks.role }));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({ EVENT_REVIEWER_DISCORD_ROLE_IDS: '123456789012345678' }),
}));
import { canReviewEventSubmissions } from '../../../src/features/events/server/review-authorization';

const session = { user: { id: '123456789012345678' } } as DashboardSession;
it('uses the separate event-reviewer role and fails closed on verification errors', async () => {
  mocks.role.mockResolvedValue(true);
  await expect(canReviewEventSubmissions(session)).resolves.toBe(true);
  expect(mocks.role).toHaveBeenCalledWith(session, '123456789012345678');
  mocks.role.mockRejectedValue(new Error('Discord unavailable'));
  await expect(canReviewEventSubmissions(session)).resolves.toBe(false);
});
