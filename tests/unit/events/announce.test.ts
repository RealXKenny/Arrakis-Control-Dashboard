import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstCommunityEvent } from '../../../src/features/events/contracts';
import { buildEventAnnouncement } from '../../../src/features/events/discord';
const mocks = vi.hoisted(() => ({ list: vi.fn(), sync: vi.fn(), get: vi.fn() }));
vi.mock('../../../src/lib/assert-server', () => ({}));
vi.mock('../../../src/config/env', () => ({
  getServerEnv: () => ({
    DISCORD_BOT_TOKEN: 'fixture-token',
    COMMUNITY_EVENTS_CHANNEL_ID: '1539748867833200640',
    APP_URL: 'https://dashboard.test',
    LOG_LEVEL: 'FATAL',
  }),
}));
vi.mock('../../../src/lib/redis/client', () => ({ getRedisClient: () => ({ get: mocks.get }) }));
vi.mock('../../../src/server/integrations/discord-bot', () => ({ syncDiscordAnnouncement: mocks.sync }));
vi.mock('../../../src/features/events/server/store', () => ({ listCommunityEvents: mocks.list }));
import { syncCommunityEvent, withdrawCommunityEvent } from '../../../src/features/events/server/announce';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sync.mockImplementation(async (_key, _channel, source) =>
    (await source()) ? { status: 'sent' } : { status: 'unchanged' },
  );
  mocks.list.mockResolvedValue([firstCommunityEvent()]);
  mocks.get.mockResolvedValue(null);
});

describe('community Discord announcements', () => {
  it('announces a published event using its configured channel and stable identity', async () => {
    expect(await syncCommunityEvent('base-building-competition')).toEqual({ status: 'sent' });
    expect(mocks.sync).toHaveBeenCalledWith(
      'arrakis:{community-events}:discord:base-building-competition',
      '1539748867833200640',
      expect.any(Function),
    );
    const payload = await mocks.sync.mock.calls[0][2]();
    expect(JSON.stringify(payload)).toContain('500,000 Solaris coins');
    expect(JSON.stringify(payload)).toContain('Schedule to be announced');
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });
  it('never announces a private draft or missing event', async () => {
    mocks.list.mockResolvedValue([{ ...firstCommunityEvent(), visibility: 'draft' }]);
    expect(await syncCommunityEvent('base-building-competition')).toEqual({ status: 'unchanged' });
    expect(await syncCommunityEvent('nonexistent')).toEqual({ status: 'unchanged' });
  });
  it('withdraws only existing announcements and never includes private event content', async () => {
    mocks.list.mockResolvedValue([{ ...firstCommunityEvent(), visibility: 'draft', title: 'Private draft title' }]);
    expect(await withdrawCommunityEvent('base-building-competition')).toEqual({ status: 'unchanged' });
    mocks.get.mockResolvedValue({ messageId: '1539748867833200641' });
    await withdrawCommunityEvent('base-building-competition');
    const payload = JSON.stringify(await mocks.sync.mock.calls[1][2]());
    expect(payload).toContain('withdrawn');
    expect(payload).not.toContain('Base Building Competition');
  });
  it('does not create a withdrawal notice for an announcement that was never accepted', async () => {
    mocks.list.mockResolvedValue([{ ...firstCommunityEvent(), visibility: 'draft' }]);
    mocks.get.mockResolvedValue({ outcome: 'rejected' });
    expect(await withdrawCommunityEvent('base-building-competition')).toEqual({ status: 'unchanged' });
  });
  it('uses Discord localized dates and clips long text without exposing local development links', () => {
    const event = {
      ...firstCommunityEvent(),
      startsAt: '2026-12-01T18:00:00.000Z',
      participation: 'x'.repeat(2000),
      prizeItems: 'z'.repeat(500),
    };
    const payload = buildEventAnnouncement(event, 'http://localhost:2008');
    expect(JSON.stringify(payload)).toContain('<t:');
    expect(JSON.stringify(payload)).not.toContain('localhost');
    expect(payload.components[0].components.some((component) => component.type === 1)).toBe(false);
    expect(payload.components[0].components.some((component) => component.type === 14)).toBe(true);
  });
});
