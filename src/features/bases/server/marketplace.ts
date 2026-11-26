import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { ReadCache } from '../../../lib/cache/read-cache';
import { withTimeout } from '../../../lib/http/timeout';
import { logger } from '../../../lib/logger';
import { getRedisClient } from '../../../lib/redis/client';
import type { DashboardSession } from '../../auth/server/session-store';
import { ownerKeyForId, ownerKeysForId } from './owner-key';
import { sniffThumbnail, type ThumbnailType } from '../image';
import { BASE_LISTING_LIMIT, recordSchema, summarySchema, type BaseRecord, type BaseSummary } from '../schema';
import { getMarketplaceRecord, listMarketplaceSummaries } from '../marketplace/server/store';
import { getPreviewSettings } from './preview-settings';
import { browseBases, type BaseBrowsePage, type BaseQuery } from '../browse';
import { spendReadBudget } from '../../../server/read-budget';

/**
 * Every V2 key shares the `{bm}` hash tag, so multi-key Lua scripts stay valid on a Redis Cluster
 * (all keys land in one slot). Legacy V1 listings are read through, never written.
 */
const NS = 'arrakis:{bm}:v2';
export const baseMarketplaceKeys = {
  index: `${NS}:index`,
  record: (id: string) => `${NS}:record:${id}`,
  state: (id: string) => `${NS}:state:${id}`,
  owner: (id: string) => `${NS}:owner:${id}`,
  image: (id: string) => `${NS}:image:${id}`,
  userCount: (ownerKey: string) => `${NS}:user:${ownerKey}`,
  userBytes: (ownerKey: string) => `${NS}:bytes:${ownerKey}`,
  totalBytes: `${NS}:bytes-total`,
  size: (id: string) => `${NS}:size:${id}`,
};

export const MAX_LISTINGS_PER_USER = 25;
/** Stored bytes (layout plus picture) one member may hold, and the marketplace as a whole. Legacy listings are not counted. */
export const MAX_BYTES_PER_USER = 24 * 1024 * 1024;
export const MAX_BYTES_TOTAL = 256 * 1024 * 1024;
const TIMEOUT_MS = 12_000;

function redis() {
  const client = getRedisClient();
  if (!client) throw new AppError('Marketplace storage is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return client;
}

export function ownerKeyFor(session: DashboardSession): string {
  return ownerKeyForId(session.user.id);
}

/** Current and legacy keys: ownership checks accept both until `marketplace:rekey` has been applied. */
export function ownerKeysFor(session: DashboardSession): string[] {
  return ownerKeysForId(session.user.id);
}

const PUBLISH_SCRIPT = `
-- A listing ID that is already stored would be counted twice and its size record overwritten.
if redis.call('EXISTS', KEYS[2]) == 1 then return -5 end
if redis.call('ZCARD', KEYS[1]) >= tonumber(ARGV[7]) then return -2 end
local count = tonumber(redis.call('GET', KEYS[6]) or '0')
if count >= tonumber(ARGV[6]) then return -1 end
local size = tonumber(ARGV[8])
if tonumber(redis.call('GET', KEYS[7]) or '0') + size > tonumber(ARGV[9]) then return -3 end
if tonumber(redis.call('GET', KEYS[8]) or '0') + size > tonumber(ARGV[10]) then return -4 end
redis.call('SET', KEYS[2], ARGV[1])
redis.call('SET', KEYS[3], ARGV[2])
redis.call('SET', KEYS[4], ARGV[4])
if ARGV[5] ~= '' then redis.call('SET', KEYS[5], ARGV[5]) end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
redis.call('INCR', KEYS[6])
redis.call('INCRBY', KEYS[7], size)
redis.call('INCRBY', KEYS[8], size)
redis.call('SET', KEYS[9], size)
return 1
`;

const DELETE_SCRIPT = `
local owner = redis.call('GET', KEYS[4])
if not owner or (owner ~= ARGV[1] and owner ~= ARGV[2]) then return 0 end
-- Read and sanitise every number before the first write: a malformed value must not stop the script halfway,
-- because Redis does not roll back the commands that already ran. Unreadable numbers count as zero (no refund).
-- Only listings that were counted at publish time (they carry a size record) give bytes back; legacy ones never took any.
local summary = redis.call('GET', KEYS[3])
local size = tonumber(redis.call('GET', KEYS[11]) or '0') or 0
local bytesKey = (owner == ARGV[1]) and KEYS[8] or KEYS[9]
local counter = (owner == ARGV[1]) and KEYS[6] or KEYS[7]
local count = tonumber(redis.call('GET', counter) or '0') or 0
local heldOwner = tonumber(redis.call('GET', bytesKey) or '0') or 0
local heldTotal = tonumber(redis.call('GET', KEYS[10]) or '0') or 0
if summary then redis.call('ZREM', KEYS[1], summary) end
redis.call('DEL', KEYS[2], KEYS[3], KEYS[4], KEYS[5], KEYS[11])
if size > 0 then
  if heldOwner > size then redis.call('SET', bytesKey, heldOwner - size) else redis.call('DEL', bytesKey) end
  if heldTotal > size then redis.call('SET', KEYS[10], heldTotal - size) else redis.call('DEL', KEYS[10]) end
end
if count > 1 then redis.call('DECR', counter) else redis.call('DEL', counter) end
return 1
`;

const listCache = new ReadCache<BaseSummary[]>(
  (value) => JSON.stringify(value).length,
  () => true,
  { ttlMs: 10_000, maxEntries: 1 },
);

export type PublishOutcome = 'ok' | 'user-limit' | 'storage-limit' | 'full';

export async function publishBase(
  record: BaseRecord,
  thumbnail: { type: ThumbnailType; base64: string } | null,
): Promise<PublishOutcome> {
  const { id, ownerKey, publishedAt } = record.summary;
  if (!ownerKey) throw new Error('Published bases must carry an owner key.');
  const storedRecord = JSON.stringify(record);
  const storedImage = thumbnail ? JSON.stringify(thumbnail) : '';
  const result = await withTimeout(
    redis().eval(
      PUBLISH_SCRIPT,
      [
        baseMarketplaceKeys.index,
        baseMarketplaceKeys.record(id),
        baseMarketplaceKeys.state(id),
        baseMarketplaceKeys.owner(id),
        baseMarketplaceKeys.image(id),
        baseMarketplaceKeys.userCount(ownerKey),
        baseMarketplaceKeys.userBytes(ownerKey),
        baseMarketplaceKeys.totalBytes,
        baseMarketplaceKeys.size(id),
      ],
      [
        storedRecord,
        JSON.stringify(record.summary),
        -Date.parse(publishedAt),
        ownerKey,
        storedImage,
        MAX_LISTINGS_PER_USER,
        BASE_LISTING_LIMIT,
        Buffer.byteLength(storedRecord) + Buffer.byteLength(storedImage),
        MAX_BYTES_PER_USER,
        MAX_BYTES_TOTAL,
      ],
    ),
    TIMEOUT_MS,
  );
  listCache.clear();
  if (Number(result) === -1) return 'user-limit';
  if (Number(result) === -5) throw new AppError('This base is already published.', 409, 'ALREADY_PUBLISHED', true);
  if (Number(result) === -2 || Number(result) === -4) return 'full';
  if (Number(result) === -3) return 'storage-limit';
  return 'ok';
}

export async function deleteBase(id: string, ownerKeys: [string, string]): Promise<boolean> {
  const [ownerKey, legacyKey] = ownerKeys;
  if (!/^[a-f0-9]{24}$/.test(id)) return false;
  const result = await withTimeout(
    redis().eval(
      DELETE_SCRIPT,
      [
        baseMarketplaceKeys.index,
        baseMarketplaceKeys.record(id),
        baseMarketplaceKeys.state(id),
        baseMarketplaceKeys.owner(id),
        baseMarketplaceKeys.image(id),
        baseMarketplaceKeys.userCount(ownerKey),
        baseMarketplaceKeys.userCount(legacyKey),
        baseMarketplaceKeys.userBytes(ownerKey),
        baseMarketplaceKeys.userBytes(legacyKey),
        baseMarketplaceKeys.totalBytes,
        baseMarketplaceKeys.size(id),
      ],
      [ownerKey, legacyKey],
    ),
    TIMEOUT_MS,
  );
  listCache.clear();
  return Number(result) === 1;
}

function parseSummaries(values: unknown[]): BaseSummary[] {
  const summaries: BaseSummary[] = [];
  for (const value of values) {
    const parsed = summarySchema.safeParse(value);
    // A single malformed member must never take the whole catalogue down.
    if (parsed.success) summaries.push(parsed.data);
  }
  return summaries;
}

/** V2 listings merged with read-only legacy listings, newest first. Cached for 10s. */
export async function listBases(): Promise<BaseSummary[]> {
  const entry = await listCache.get('all', async () => {
    const [current, legacy] = await Promise.all([
      withTimeout(
        redis().zrange<unknown[]>(baseMarketplaceKeys.index, 0, BASE_LISTING_LIMIT - 1, { byScore: false }),
        TIMEOUT_MS,
      ),
      listMarketplaceSummaries(BASE_LISTING_LIMIT).catch((error) => {
        logger.warn('Legacy marketplace listings unavailable', { error });
        return [];
      }),
    ]);
    const byId = new Map<string, BaseSummary>();
    for (const summary of [...parseSummaries(legacy), ...parseSummaries(current)]) byId.set(summary.id, summary);
    return [...byId.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  });
  return entry.data;
}

export async function getBase(id: string): Promise<BaseRecord | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const stored = await withTimeout(redis().get<unknown>(baseMarketplaceKeys.record(id)), TIMEOUT_MS);
  const parsed = recordSchema.safeParse(stored);
  if (parsed.success) return parsed.data;
  const legacy = await getMarketplaceRecord(id).catch(() => null);
  const migrated = recordSchema.safeParse(legacy);
  return migrated.success ? migrated.data : null;
}

export async function getBaseImage(id: string): Promise<{ type: ThumbnailType; bytes: Buffer } | null> {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const stored = await withTimeout(
    redis().get<{ type?: string; base64?: string }>(baseMarketplaceKeys.image(id)),
    TIMEOUT_MS,
  );
  if (stored && typeof stored.base64 === 'string') {
    const bytes = Buffer.from(stored.base64, 'base64');
    // Re-sniff on the way out: the stored content type is a hint, the bytes are the truth.
    const type = sniffThumbnail(bytes);
    if (type) return { type, bytes };
  }
  const legacy = await getPreviewSettings(id).catch(() => null);
  if (legacy?.image) return { type: 'image/png', bytes: Buffer.from(legacy.image.split(',')[1], 'base64') };
  return null;
}

export type BrowseResult =
  | { status: 'ok'; data: BaseBrowsePage; viewerKeys: string[] }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

export type DetailResult =
  | { status: 'ok'; record: BaseRecord; isOwner: boolean }
  | { status: 'not-found' }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

function unavailable(error: unknown, action: string): { status: 'unavailable'; message: string } {
  if (error instanceof AppError && error.expose) return { status: 'unavailable', message: error.message };
  logger.error(`Unable to ${action}`, error);
  return { status: 'unavailable', message: 'The marketplace is unreachable right now. Try again shortly.' };
}

export async function loadBaseBrowse(query: BaseQuery, session: DashboardSession): Promise<BrowseResult> {
  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };
  try {
    return { status: 'ok', data: browseBases(await listBases(), query), viewerKeys: ownerKeysFor(session) };
  } catch (error) {
    return unavailable(error, 'browse bases');
  }
}

export async function loadBaseDetail(id: string, session: DashboardSession): Promise<DetailResult> {
  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };
  try {
    const record = await getBase(id);
    if (!record) return { status: 'not-found' };
    return { status: 'ok', record, isOwner: ownerKeysFor(session).includes(record.summary.ownerKey ?? '') };
  } catch (error) {
    return unavailable(error, 'load a base');
  }
}
