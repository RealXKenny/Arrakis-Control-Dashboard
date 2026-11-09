import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardSession } from '../../../src/features/auth/server/session-store';
const linked = vi.hoisted(() => vi.fn());
vi.mock('../../../src/features/player/server/linked-player', () => ({ getLinkedPlayer: linked }));
import { loadChatViewer } from '../../../src/features/chat/server/viewer';
const session: DashboardSession = {
  user: { id: '123', username: 'RealXKenny', global_name: 'Kenny', guild_nickname: 'Server Nick' },
  guildId: 'guild',
  roleIds: ['role'],
  expiresAt: Date.now() + 60_000,
  linkedPlayerName: 'Old Character',
};
beforeEach(() => vi.clearAllMocks());
describe('chat viewer aliases', () => {
  it('loads the actual linked name even when Live Chat is the first page opened', async () => {
    linked.mockResolvedValue({ linked: true, characterName: 'Current Character' });
    expect(await loadChatViewer(session)).toEqual({
      userId: '123',
      names: ['Current Character', 'RealXKenny', 'Kenny', 'Server Nick'],
    });
    expect(linked).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '123', guildId: 'guild', roleIds: ['role'] }),
      { timeout: 1500 },
    );
  });
  it('keeps chat usable with cached presentation names during an upstream outage', async () => {
    linked.mockRejectedValue(new Error('upstream unavailable'));
    expect((await loadChatViewer(session)).names).toContain('Old Character');
  });
  it('drops the cached character name on an explicit unlink and sends only bounded display metadata', async () => {
    linked.mockResolvedValue({ linked: false });
    const viewer = await loadChatViewer(session);
    expect(viewer).toEqual({ userId: '123', names: ['RealXKenny', 'Kenny', 'Server Nick'] });
    expect(viewer).not.toHaveProperty('roleIds');
    expect(viewer).not.toHaveProperty('guildId');
    expect(viewer).not.toHaveProperty('email');
  });
});
