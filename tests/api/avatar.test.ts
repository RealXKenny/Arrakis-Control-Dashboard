import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ session: vi.fn(), serve: vi.fn() }));
vi.mock('../../src/features/auth/server/session', () => ({ currentSession: mocks.session }));
vi.mock('../../src/features/auth/server/avatar', () => ({ serveDiscordAvatar: mocks.serve }));
import { GET } from '../../src/app/api/v2/auth/avatar/[userId]/[avatar]/route';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({ user: { id: 'member' } });
});
const request = () =>
  GET(new Request('https://dashboard.test/api/v2/auth/avatar/123/' + 'a'.repeat(32)), {
    params: Promise.resolve({ userId: '123', avatar: 'a'.repeat(32) }),
  });

describe('authenticated avatar images', () => {
  it('rejects anonymous requests before any Redis or CDN operation', async () => {
    mocks.session.mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(mocks.serve).not.toHaveBeenCalled();
  });
  it('delegates validated route identifiers with the authenticated viewer identity', async () => {
    mocks.serve.mockResolvedValue(new Response('image', { headers: { 'Content-Type': 'image/png' } }));
    expect((await request()).status).toBe(200);
    expect(mocks.serve).toHaveBeenCalledWith(expect.any(Request), '123', 'a'.repeat(32), 'member');
  });
});
