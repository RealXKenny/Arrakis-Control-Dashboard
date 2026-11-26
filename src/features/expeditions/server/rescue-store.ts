import '../../../lib/assert-server';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import { rescueDataSchema, SHARE_ID_PATTERN, type RescueCard, type RescueData, type RescueOwnerView } from '../rescue';

/** Every key shares `{rescue}` so publication and cancellation stay atomic on standalone and Cluster Redis. */
const PREFIX = 'arrakis:{rescue}:v1';
const MAX_BYTES = 8192;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const ownerKey = (userId: string) => {
  if (!userId || userId.length > 128) throw unavailable();
  return `${PREFIX}:owner:${hash(userId)}`;
};
const cardKey = (tag: string) => `${PREFIX}:card:${tag}`;

const ownerSchema = z
  .object({ shareId: z.string().regex(SHARE_ID_PATTERN), tag: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
const cardSchema = z
  .object({
    schemaVersion: z.literal(1),
    data: rescueDataSchema,
    publishedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
  })
  .strict();

const PUBLISH = `
-- rescue-publish
local current = redis.call('GET', KEYS[1])
local tag = ''
if current then
  local ok, owner = pcall(cjson.decode, current)
  if not ok or type(owner) ~= 'table' or type(owner.tag) ~= 'string' then return 'invalid' end
  tag = owner.tag
end
if tag ~= ARGV[1] then return 'conflict' end
if KEYS[3] ~= KEYS[2] then redis.call('DEL', KEYS[3]) end
redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[4])
redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
return 'ok'
`;
const CANCEL = `
-- rescue-cancel
local current = redis.call('GET', KEYS[1])
if not current then return 'conflict' end
local ok, owner = pcall(cjson.decode, current)
if not ok or type(owner) ~= 'table' or owner.tag ~= ARGV[1] then return 'conflict' end
redis.call('DEL', KEYS[2])
redis.call('DEL', KEYS[1])
return 'ok'
`;

function unavailable() {
  return new AppError('Rescue requests are unavailable right now.', 503, 'RESCUE_UNAVAILABLE', true);
}
const conflict = () =>
  new AppError('Your rescue request changed elsewhere. Refresh before trying again.', 409, 'RESCUE_CONFLICT', true);
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
const READ = `
-- rescue-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
return redis.call('GET', KEYS[1]) or ''
`;
/** Raw string reads; the shared client's `get` JSON-decodes values, which would bypass strict parsing. */
async function raw(key: string): Promise<string> {
  const value = await redis().eval(READ, [key], [MAX_BYTES]);
  if (typeof value !== 'string') throw unavailable();
  return value;
}
function parseCard(value: string, now: number): RescueCard | null {
  if (value === '') return null;
  if (Buffer.byteLength(value) > MAX_BYTES) throw unavailable();
  const card = cardSchema.parse(JSON.parse(value));
  // Redis TTL is the primary expiry; the explicit check covers clock drift and missed expirations.
  if (Date.parse(card.expiresAt) <= now) return null;
  return { data: card.data, publishedAt: card.publishedAt, expiresAt: card.expiresAt };
}

export async function readOwnRescue(userId: string, now = Date.now()): Promise<RescueOwnerView> {
  try {
    const stored = await raw(ownerKey(userId));
    if (stored === '') return { active: null };
    const owner = ownerSchema.parse(JSON.parse(stored));
    if (hash(owner.shareId) !== owner.tag) throw unavailable();
    const card = parseCard(await raw(cardKey(owner.tag)), now);
    return { active: card ? { ...card, shareId: owner.shareId, tag: owner.tag } : null };
  } catch {
    throw unavailable();
  }
}

/** Replaces any active card for this owner with a new unlisted link; the old link stops working atomically. */
export async function publishRescue(
  userId: string,
  expected: string | null,
  data: RescueData,
  hours: 1 | 2 | 6,
  now = Date.now(),
): Promise<RescueOwnerView> {
  const parsed = rescueDataSchema.safeParse(data);
  if (!parsed.success) throw new AppError('This rescue request is invalid.', 400, 'INVALID_RESCUE', true);
  const shareId = randomBytes(32).toString('base64url');
  const tag = hash(shareId);
  const publishedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + hours * 3_600_000).toISOString();
  const card = JSON.stringify({ schemaVersion: 1, data: parsed.data, publishedAt, expiresAt });
  if (Buffer.byteLength(card) > MAX_BYTES)
    throw new AppError('This rescue request is too large.', 400, 'INVALID_RESCUE', true);
  let reply: unknown;
  try {
    reply = await redis().eval(
      PUBLISH,
      [ownerKey(userId), cardKey(tag), cardKey(expected ?? tag)],
      [expected ?? '', card, JSON.stringify({ shareId, tag }), hours * 3600],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
  return { active: { data: parsed.data, publishedAt, expiresAt, shareId, tag } };
}

export async function cancelRescue(userId: string, expected: string): Promise<RescueOwnerView> {
  if (!/^[0-9a-f]{64}$/.test(expected)) throw conflict();
  let reply: unknown;
  try {
    reply = await redis().eval(CANCEL, [ownerKey(userId), cardKey(expected)], [expected]);
  } catch {
    throw unavailable();
  }
  if (reply !== 'ok') throw conflict();
  return { active: null };
}

/** Member read through an unlisted link. Unknown, cancelled, replaced and expired links are indistinguishable. */
export async function readSharedRescue(shareId: string, now = Date.now()): Promise<RescueCard | null> {
  if (!SHARE_ID_PATTERN.test(shareId)) return null;
  try {
    return parseCard(await raw(cardKey(hash(shareId))), now);
  } catch {
    throw unavailable();
  }
}
