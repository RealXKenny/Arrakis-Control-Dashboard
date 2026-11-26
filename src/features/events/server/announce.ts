import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { createLogger } from '../../../lib/logger';
import { discordContainer } from '../../../lib/discord-components';
import { syncDiscordAnnouncement, type DiscordAnnouncementResult } from '../../../server/integrations/discord-bot';
import { buildEventAnnouncement } from '../discord';
import { eventIdSchema } from '../contracts';
import { listCommunityEvents } from './store';
import { getRedisClient } from '../../../lib/redis/client';

const log = createLogger('DISCORD');
const stateKey = (id: string) => `arrakis:{community-events}:discord:${eventIdSchema.parse(id)}`;

export async function syncCommunityEvent(id: string): Promise<DiscordAnnouncementResult> {
  const env = getServerEnv();
  if (!env.DISCORD_BOT_TOKEN || !env.COMMUNITY_EVENTS_CHANNEL_ID) return { status: 'unconfigured' };
  return syncDiscordAnnouncement(stateKey(id), env.COMMUNITY_EVENTS_CHANNEL_ID, async () => {
    // Read under the Discord lease: an older request must never re-publish a newly private draft.
    const event = (await listCommunityEvents(true)).find((row) => row.id === id);
    if (event?.visibility === 'published') return buildEventAnnouncement(event, env.APP_URL);
    const previous = await getRedisClient()?.get<{ messageId?: unknown }>(stateKey(id));
    if (!previous || typeof previous.messageId !== 'string') return null;
    return discordContainer(
      '# Community event withdrawn\n\nThis event is no longer published. Check the dashboard for current community events.',
    );
  });
}

/** Replace a previously public announcement without leaking private draft edits. */
export async function withdrawCommunityEvent(id: string): Promise<DiscordAnnouncementResult> {
  return syncCommunityEvent(id);
}

/** Event records are the durable publication intent; reconnect/restart scans recover known failed posts. */
export function startCommunityEventAnnouncements(): void {
  let running = false;
  const scan = async () => {
    if (running) return;
    running = true;
    try {
      const events = await listCommunityEvents(true);
      for (const event of events) {
        const result =
          event.visibility === 'published'
            ? await syncCommunityEvent(event.id)
            : await withdrawCommunityEvent(event.id);
        if (['failed', 'unknown'].includes(result.status))
          log.warn('Community event announcement needs attention', { eventId: event.id, outcome: result.status });
      }
    } catch {
      log.warn('Community event announcements are temporarily unavailable.');
    } finally {
      running = false;
    }
  };
  void scan();
  const timer = setInterval(() => void scan(), 60_000);
  timer.unref();
}
