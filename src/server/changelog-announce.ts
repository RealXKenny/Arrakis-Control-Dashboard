import '../lib/assert-server';
import { AppError } from '../lib/errors';
import { getServerEnv } from '../lib/env';
import { withTimeout } from '../lib/http/timeout';
import { logger } from '../lib/logger';
import { getRedisClient } from '../lib/redis/client';
import { readChangelog } from '../modules/changelog/server/read';
import { buildWebhookPayload, type Announcement } from '../features/changelog/discord';
import { executeWebhook } from './discord-webhook';

/** One hash tag for every key, so the Lua scripts stay valid on a Redis Cluster. */
const NS = 'arrakis:{cl}:v2';
const keys = {
  lastAnnounced: `${NS}:last-announced`,
  history: `${NS}:history`,
  progress: (slug: string) => `${NS}:progress:${slug}`,
};
const TIMEOUT_MS = 8_000;
const HISTORY_SIZE = 20;
const PROGRESS_TTL_SECONDS = 90 * 24 * 60 * 60;

const slug = (version: string) => version.toLowerCase().replace(/[^a-z0-9.+-]/g, '-');

// Compare-and-set: only one instance wins the right to announce a given release.
const CLAIM_SCRIPT = `
local current = redis.call('GET', KEYS[1])
if (current or '') == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]) return 1 end
return 0
`;
const HISTORY_SCRIPT = `
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -${HISTORY_SIZE + 1})
return 1
`;

export interface AnnouncementStatus {
  configured: boolean;
  autoAnnounce: boolean;
  storage: boolean;
  lastAnnounced: string | null;
  history: Array<{ at: string; kind: string; version: string; edited: boolean; by: string }>;
}

function webhookUrl(): string {
  const url = getServerEnv().CHANGELOG_WEBHOOK_URL;
  if (!url) throw new AppError('The changelog webhook is not configured.', 503, 'WEBHOOK_NOT_CONFIGURED', true);
  return url;
}

async function recordHistory(entry: { kind: string; version: string; edited: boolean; by: string }) {
  const redis = getRedisClient();
  if (!redis) return;
  const at = new Date();
  await withTimeout(
    redis.eval(HISTORY_SCRIPT, [keys.history], [at.getTime(), JSON.stringify({ at: at.toISOString(), ...entry })]),
    TIMEOUT_MS,
  ).catch((error) => logger.warn('Unable to record announcement history', { error }));
}

export async function getAnnouncementStatus(): Promise<AnnouncementStatus> {
  const env = getServerEnv();
  const redis = getRedisClient();
  const status: AnnouncementStatus = {
    configured: Boolean(env.CHANGELOG_WEBHOOK_URL),
    autoAnnounce: env.CHANGELOG_AUTO_ANNOUNCE,
    storage: Boolean(redis),
    lastAnnounced: null,
    history: [],
  };
  if (!redis) return status;
  try {
    const last = await withTimeout(redis.get<unknown>(keys.lastAnnounced), TIMEOUT_MS);
    status.lastAnnounced = last === null ? null : String(last);
    const rows = await withTimeout(
      redis.zrange<unknown[]>(keys.history, 0, HISTORY_SIZE - 1, { byScore: false }),
      TIMEOUT_MS,
    );
    status.history = rows
      .flatMap((row) => {
        const value = row as Partial<AnnouncementStatus['history'][number]> | null;
        return value && typeof value.at === 'string' && typeof value.version === 'string'
          ? [
              {
                at: value.at,
                kind: String(value.kind),
                version: value.version,
                edited: Boolean(value.edited),
                by: String(value.by),
              },
            ]
          : [];
      })
      .reverse();
  } catch (error) {
    logger.warn('Unable to read announcement status', { error });
  }
  return status;
}

/**
 * Send a release or progress announcement.
 * Progress posts are tracked per version: the first one is created, later ones edit it in place,
 * so the channel shows one live status message instead of a stack of near-duplicates.
 */
export async function announce(input: Announcement, actor: string): Promise<{ edited: boolean }> {
  const url = webhookUrl();
  const release =
    input.kind === 'release' ? (await readChangelog()).find((entry) => entry.version === input.version) : undefined;
  if (input.kind === 'release' && !release) {
    throw new AppError(`Release ${input.version} is not in CHANGELOG.md.`, 404, 'RELEASE_NOT_FOUND', true);
  }
  const payload = buildWebhookPayload(input, { appUrl: getServerEnv().APP_URL, release });

  const redis = getRedisClient();
  const trackKey = input.kind === 'progress' ? keys.progress(slug(input.version)) : null;
  let edited = false;
  let messageId: string | null = null;

  if (redis && trackKey) {
    const existing = await withTimeout(redis.get<unknown>(trackKey), TIMEOUT_MS).catch(() => null);
    const previous = existing === null ? null : String(existing);
    if (previous && /^\d{15,25}$/.test(previous)) {
      const result = await executeWebhook(url, payload, previous);
      if (result.status === 'ok') {
        edited = true;
        messageId = result.messageId;
      }
    }
  }
  if (!messageId) {
    const result = await executeWebhook(url, payload);
    if (result.status === 'ok') messageId = result.messageId;
  }
  if (redis && trackKey && messageId) {
    await withTimeout(redis.set(trackKey, messageId, { ex: PROGRESS_TTL_SECONDS }), TIMEOUT_MS).catch((error) =>
      logger.warn('Unable to remember progress message', { error }),
    );
  }

  await recordHistory({ kind: input.kind, version: input.version, edited, by: actor });
  return { edited };
}

export type AutoAnnounceOutcome = 'disabled' | 'baseline' | 'current' | 'lost-claim' | 'announced' | 'failed';

/**
 * Automated release announcements, safe for several instances starting at once.
 *  - First run only records the current release as a baseline, so enabling the feature never
 *    replays old history into the channel.
 *  - A newer release is claimed with compare-and-set, announced once, and the claim is rolled back
 *    on failure so the next start can retry.
 */
export async function announceLatestRelease(): Promise<AutoAnnounceOutcome> {
  const env = getServerEnv();
  const redis = getRedisClient();
  if (!env.CHANGELOG_AUTO_ANNOUNCE || !env.CHANGELOG_WEBHOOK_URL || !redis) return 'disabled';

  const latest = (await readChangelog())[0];
  if (!latest) return 'disabled';

  const stored = await withTimeout(redis.get<unknown>(keys.lastAnnounced), TIMEOUT_MS);
  const previous = stored === null ? '' : String(stored);
  if (previous === latest.version) return 'current';

  const won = Number(
    await withTimeout(redis.eval(CLAIM_SCRIPT, [keys.lastAnnounced], [previous, latest.version]), TIMEOUT_MS),
  );
  if (won !== 1) return 'lost-claim';
  if (previous === '') return 'baseline';

  try {
    await announce(
      { kind: 'release', version: latest.version, headline: '', note: '', progress: [], buttons: [] },
      'automatic',
    );
    return 'announced';
  } catch (error) {
    // Dev note: the sandworm only surfaces once; a failed ride gets rolled back so it can try again.
    logger.error('Automatic changelog announcement failed', error);
    await withTimeout(redis.eval(CLAIM_SCRIPT, [keys.lastAnnounced], [latest.version, previous]), TIMEOUT_MS).catch(
      () => undefined,
    );
    return 'failed';
  }
}
