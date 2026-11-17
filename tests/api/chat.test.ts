import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  process.env.APP_URL = 'https://portal.test';
  return { send: vi.fn(), session: vi.fn(), sessionId: vi.fn(), history: vi.fn(), gateway: vi.fn() };
});
vi.mock('../../src/features/chat/server/send', () => ({ sendChatMessage: mocks.send }));
vi.mock('../../src/features/auth/server/session', () => ({
  currentSession: mocks.session,
  currentSessionId: mocks.sessionId,
}));
vi.mock('../../src/features/chat/server/history', () => ({ readChatHistory: mocks.history }));
vi.mock('../../src/features/chat/server/gateway', () => ({ createChatGateway: mocks.gateway }));
vi.mock('../../src/features/chat/server/config', () => ({
  getChatConfig: () => ({ servers: [{ id: 'hagga-basin' }] }),
  getChatServer: (id: string) => (id === 'hagga-basin' ? { id } : null),
}));

import { POST } from '../../src/app/api/v2/chat/messages/route';
import { GET as HISTORY } from '../../src/app/api/v2/chat/history/route';
import { GET as STREAM } from '../../src/app/api/v2/chat/stream/route';

function request(origin = 'https://portal.test') {
  return new Request('https://portal.test/api/v2/chat/messages', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' },
    body: JSON.stringify({ serverId: 'hagga-basin', content: 'hello' }),
  });
}

describe('chat HTTP boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APP_URL', 'https://portal.test');
  });

  it('authorizes history and SSE independently before accessing their backends', async () => {
    mocks.session.mockResolvedValue(null);
    mocks.sessionId.mockResolvedValue(null);
    expect((await HISTORY(new Request('https://portal.test/api/v2/chat/history?server=hagga-basin'))).status).toBe(401);
    expect((await STREAM(new Request('https://portal.test/api/v2/chat/stream?server=hagga-basin'))).status).toBe(401);
    expect(mocks.history).not.toHaveBeenCalled();
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it('refuses unconfigured history destinations for an authenticated member', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'member' } });
    expect((await HISTORY(new Request('https://portal.test/api/v2/chat/history?server=unconfigured'))).status).toBe(
      404,
    );
    expect(mocks.history).not.toHaveBeenCalled();
  });

  it('never lets a caller request unpublished records through the history endpoint', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'member' } });
    mocks.history.mockResolvedValue({ messages: [], nextCursor: null });
    expect(
      (await HISTORY(new Request('https://portal.test/api/v2/chat/history?server=hagga-basin&includeUnpublished=true')))
        .status,
    ).toBe(200);
    expect(mocks.history).toHaveBeenCalledWith('hagga-basin', { before: undefined });
  });

  it('rejects anonymous sends before touching the publisher', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('rejects cross-origin mutations and oversized bodies', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'member' } });
    const crossOrigin = await POST(request('https://attacker.test'));
    expect(crossOrigin.status).toBe(403);
    expect(mocks.send).not.toHaveBeenCalled();

    const oversized = new Request('https://portal.test/api/v2/chat/messages', {
      method: 'POST',
      headers: {
        Origin: 'https://portal.test',
        'Content-Type': 'application/json',
        'X-Forwarded-Proto': 'https',
      },
      body: JSON.stringify({ serverId: 'hagga-basin', content: 'a'.repeat(9_000) }),
    });
    const response = await POST(oversized);
    expect(response.status).toBe(413);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('returns the accurate unknown delivery state instead of fabricating success', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'member' } });
    mocks.send.mockResolvedValue({
      status: 202,
      error: 'Delivery could not be confirmed.',
      message: { id: 'message-1', delivery: 'unknown' },
    });
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ ok: true, message: { delivery: 'unknown' } });
  });
});
