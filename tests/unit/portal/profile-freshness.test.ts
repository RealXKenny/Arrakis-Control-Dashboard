import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ profile: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/features/player/server/handler', () => ({ loadPlayerProfile: state.profile }));
vi.mock('../../../src/features/portal/server/world', () => ({ readWorld: vi.fn() }));
vi.mock('../../../src/features/auth/server/session', () => ({ currentSessionId: async () => 'fixture-session' }));
vi.mock('../../../src/server/read-budget', () => ({ spendReadBudget: async () => ({ allowed: true }) }));
vi.mock('../../../src/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn() } }));
import { loadPortalProfile } from '../../../src/features/portal/server/load';
afterEach(() => vi.useRealTimers());
it('returns the original cache capture time until a genuinely new profile load completes', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const now = Date.parse('2026-11-15T20:00:00Z');
  vi.setSystemTime(now);
  state.profile.mockResolvedValue({ linked: true, pawnId: '123', characterName: 'Freshness fixture', details: {} });
  const session = {
    user: { id: 'cache-freshness', username: 'Member' },
    guildId: 'guild',
    roleIds: [],
    expiresAt: now + 86400000,
  };
  const first = await loadPortalProfile(session);
  expect(first).toMatchObject({ status: 'ok', capturedAt: new Date(now).toISOString() });
  vi.setSystemTime(now + 5000);
  expect(await loadPortalProfile(session)).toMatchObject({ status: 'ok', capturedAt: new Date(now).toISOString() });
  expect(state.profile).toHaveBeenCalledTimes(1);
  vi.setSystemTime(now + 16000);
  expect(await loadPortalProfile(session)).toMatchObject({
    status: 'ok',
    capturedAt: new Date(now + 16000).toISOString(),
  });
  expect(state.profile).toHaveBeenCalledTimes(2);
});
