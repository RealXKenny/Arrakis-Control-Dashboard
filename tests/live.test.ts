import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeEvent } from '../src/modules/live/server/normalize';
import { GET } from '../src/modules/live/server/route';
import { getSession } from '../src/lib/session-store';
import { liveStore } from '../src/modules/live/server/store';
import { responseMock } from './helpers/response';

vi.mock('../src/lib/session-store', () => ({ getSession: vi.fn() }));
vi.mock('../src/modules/live/server/store', () => ({ liveStore: vi.fn() }));
vi.mock('../src/config/env', () => ({
  getServerEnv: () => ({ LOG_LEVEL: 'INFO', LIVE_EVENTS_ENABLED: 'true', LIVE_EVENTS_ADMIN_ROLE_IDS: '123' }),
}));

describe('live observations', () => {
  it('decodes chat without exposing extra payload fields', () => {
    const event = normalizeEvent(
      'chat.intercept',
      JSON.stringify({
        content: JSON.stringify({
          m_Id: 'chat-1',
          m_ChannelType: 'Map',
          secret: 'hidden',
          m_Message: { m_UnlocalizedMessage: '<script>hello</script>' },
        }),
      }),
      'id',
      100,
    );
    expect(event.kind).toBe('chat');
    expect(event.id).toBe('chat-1');
    expect(event.fields.message).toBe('<script>hello</script>');
    expect(JSON.stringify(event)).not.toContain('hidden');
  });
  it('discards private chat and malformed or oversized payloads', () => {
    const payload = JSON.stringify({
      content: { m_Id: 'id', m_ChannelType: 'Whispers', m_Message: { m_UnlocalizedMessage: 'private' } },
    });
    expect(normalizeEvent('chat.intercept', payload, '1', 100).fields).toEqual({});
    for (const body of ['not-json', 'x'.repeat(65537)])
      expect(normalizeEvent('notifications', body, '1', 100).kind).toBe('observation');
  });
  it('preserves unknown status semantics and nested activity', () => {
    expect(normalizeEvent('status.test', '{"ServerState":4,"MapName":null}', 'id', 100).fields).toMatchObject({
      state: 4,
      map: null,
    });
    const content = JSON.stringify({
      content: JSON.stringify({
        m_PlayerId: 'player',
        m_ActivityData: { m_Map: { Name: { unknown: true } }, m_DimensionIndex: 0, m_bIsAuthorityTransfer: false },
      }),
    });
    expect(normalizeEvent('notifications', JSON.stringify({ content }), 'id', 100)).toMatchObject({
      kind: 'activity',
      fields: { player: 'player', map: null, dimension: 0, authorityTransfer: false },
    });
  });
});

describe('live access boundary', () => {
  beforeEach(() => vi.clearAllMocks());
  it('rejects anonymous requests without reading history', async () => {
    vi.mocked(getSession).mockResolvedValue(null);
    const result = await GET({ headers: {} }, responseMock());
    expect(result.status).toBe(401);
    expect(liveStore).not.toHaveBeenCalled();
  });
  it.each([false, true])('scopes history reads using server roles (admin=%s)', async (admin) => {
    vi.mocked(getSession).mockResolvedValue({
      user: { id: 'user' },
      guildId: 'guild',
      roleIds: admin ? ['123'] : ['456'],
      expiresAt: Date.now() + 60000,
    });
    const lrange = vi.fn().mockResolvedValue([]);
    vi.mocked(liveStore).mockReturnValue({
      prefix: 'test',
      redis: { get: vi.fn().mockResolvedValue(null), lrange },
    } as unknown as ReturnType<typeof liveStore>);
    const result = await GET({ headers: { cookie: 'dashboard_session=test' } }, responseMock());
    expect(JSON.parse(String(result.body)).admin).toBe(admin);
    expect(lrange.mock.calls.map((call) => call[0])).toEqual(
      admin ? ['test:status', 'test:chat', 'test:activity', 'test:observation'] : ['test:status'],
    );
  });
});
