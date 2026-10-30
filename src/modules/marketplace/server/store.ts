import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis';
import { withTimeout } from '../../../lib/timeout';
import { getPreviewSettings, previewKey } from '../../bases/server/preview-settings';
import {
  MARKETPLACE_LISTING_LIMIT,
  parseMarketplaceRecord,
  parseMarketplaceSummary,
  type MarketplaceRecord,
  type MarketplaceSummary,
} from '../schema';

const INDEX_KEY = 'arrakis:base-marketplace:listings';
const recordKey = (id: string) => `arrakis:base-marketplace:listing:${id}`;
const summaryStateKey = (id: string) => `arrakis:base-marketplace:summary-state:${id}`;

function client() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Marketplace storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}

export async function publishMarketplaceRecord(record: MarketplaceRecord): Promise<void> {
  const summary = JSON.stringify(record.summary);
  await withTimeout(
    client().eval(
      `
      local previous = redis.call('GET', KEYS[3])
      if previous then redis.call('ZREM', KEYS[1], previous) end
      local summary = cjson.decode(ARGV[2])
      local preview = redis.call('GET', KEYS[4])
      if preview then
        preview = cjson.decode(preview)
        if preview.image then summary.previewRevision = preview.revision end
      end
      local encoded = cjson.encode(summary)
      redis.call('SET', KEYS[2], ARGV[1])
      redis.call('SET', KEYS[3], encoded)
      redis.call('ZADD', KEYS[1], ARGV[3], encoded)
      return 1
      `,
      [INDEX_KEY, recordKey(record.summary.id), summaryStateKey(record.summary.id), previewKey(record.summary.id)],
      [JSON.stringify(record), summary, -Date.parse(record.summary.publishedAt)],
    ),
    12000,
  );
}

export async function listMarketplaceSummaries(limit = 100): Promise<MarketplaceSummary[]> {
  const count = Math.max(1, Math.min(MARKETPLACE_LISTING_LIMIT, Math.floor(limit)));
  // Negative timestamps sort newest first; these bounds select ranks, not timestamp scores.
  const values = await withTimeout(client().zrange(INDEX_KEY, 0, count - 1, { byScore: false }), 12000);
  const summaries: MarketplaceSummary[] = [];
  for (const value of values) {
    try {
      summaries.push(parseMarketplaceSummary(value));
    } catch {
      // A malformed member cannot make the public catalog unavailable.
    }
  }
  return summaries;
}

export async function getMarketplaceRecord(id: string): Promise<MarketplaceRecord | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const value = await withTimeout(client().get<unknown>(recordKey(id)), 12000);
  if (value === null) return null;
  const record = parseMarketplaceRecord(value);
  const preview = await getPreviewSettings(id);
  return preview
    ? {
        ...record,
        frontView: preview.view,
        summary: { ...record.summary, ...(preview.image ? { previewRevision: preview.revision } : {}) },
      }
    : record;
}
