import { beforeEach, describe, expect, it, vi } from 'vitest';
import { seasonTemplate } from '../../../src/features/seasons/contracts';
const state = vi.hoisted(() => ({ session: vi.fn(), budget: vi.fn(), season: vi.fn(), totals: vi.fn() }));
vi.mock('../../../src/server/http', () => ({
  requireApiSession: state.session,
  json: (body: unknown) => Response.json(body),
}));
vi.mock('../../../src/lib/security/rate-limit', () => ({ checkRateLimit: state.budget }));
vi.mock('../../../src/features/seasons/server/store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/seasons/server/store')>()),
  loadSeason: state.season,
  readRecord: state.totals,
}));
import { getCommunityProgress } from '../../../src/features/seasons/server/community';
const context = { params: Promise.resolve({ seasonId: 'season-one' }) };
beforeEach(() => {
  vi.clearAllMocks();
  state.session.mockResolvedValue({ user: { id: 'viewer' } });
  state.budget.mockResolvedValue({ allowed: true });
  state.season.mockResolvedValue({
    value: {
      id: 'season-one',
      phase: 'published',
      revision: 'server-revision',
      version: 4,
      definition: seasonTemplate(),
      privateReviewQueue: ['do-not-publish'],
    },
  });
  state.totals.mockResolvedValue({
    value: {
      participants: 2,
      completions: 1,
      xp: 700,
      claims: 1,
      version: 7,
      privateSubmissions: [{ owner: 'private-owner', text: 'private-evidence' }],
    },
  });
});
describe('live community read boundary', () => {
  it('exposes only versioned aggregates and presentation, never private extensions or another owner', async () => {
    const response = await getCommunityProgress(new Request('http://localhost'), context);
    const body = await response.json();
    expect(body.totals).toMatchObject({ completions: 1, version: 7 });
    expect(body.season).toMatchObject({ id: 'season-one', version: 4 });
    expect(JSON.stringify(body)).not.toContain('private');
    expect(body.season).not.toHaveProperty('definition');
  });
  it('requires a current session and fails closed on unavailable read protection', async () => {
    state.session.mockRejectedValueOnce(new Error('No current session'));
    await expect(getCommunityProgress(new Request('http://localhost'), context)).rejects.toThrow('No current session');
    expect(state.season).not.toHaveBeenCalled();
    state.budget.mockResolvedValue({ storageUnavailable: true, allowed: false });
    await expect(getCommunityProgress(new Request('http://localhost'), context)).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(state.season).not.toHaveBeenCalled();
  });
  it('keeps drafts private and rejects malformed stored aggregate values', async () => {
    state.season.mockResolvedValueOnce({ value: { id: 'season-one', phase: 'draft' } });
    await expect(getCommunityProgress(new Request('http://localhost'), context)).rejects.toMatchObject({
      statusCode: 404,
    });
    state.totals.mockResolvedValue({ value: { participants: 1, completions: -1, xp: 0, claims: 0 } });
    await expect(getCommunityProgress(new Request('http://localhost'), context)).rejects.toThrow(
      'Invalid community totals',
    );
  });
});
