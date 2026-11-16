import '../../../lib/assert-server';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  emptyPrivacy,
  privacyInputSchema,
  privacyRecordSchema,
  publicPrivacyView,
  type PrivacyCard,
  type PrivacyInput,
  type PrivacyRecord,
} from '../model';
const MAX_BYTES = 65536;
const RETENTION = 90 * 86400;
const READ = `-- privacy-owner-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value == '' then return false end
if value and ARGV[2] ~= '0' then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''`;
const INDEX = `-- privacy-link-read-v1
if redis.call('STRLEN', KEYS[1]) > 64 then return false end
local value = redis.call('GET', KEYS[1])
if value == '' then return false end
return value or ''`;
const SAVE = `-- privacy-save-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
 local ok, value = pcall(cjson.decode, old)
 if not ok or type(value) ~= 'table' then return 'invalid' end
 if value.revision ~= ARGV[1] or value.shareId ~= ARGV[5] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
for i = 2, 3 do
 local pointer = redis.call('GET', KEYS[i])
 if pointer and pointer ~= ARGV[6] then return 'invalid' end
end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
if KEYS[2] ~= KEYS[3] then redis.call('DEL', KEYS[2]) end
redis.call('SET', KEYS[3], ARGV[6], 'EX', ARGV[3])
return 'ok'`;
const unavailable = () =>
  new AppError('Privacy storage is unavailable. Reload before making changes.', 503, 'PRIVACY_UNAVAILABLE', true);
const missing = () =>
  new AppError('This member link is unavailable or no longer shared.', 404, 'SHARE_NOT_FOUND', true);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const ownerKey = (hash: string) => `arrakis:{privacy}:v1:owner:${hash}`;
export function privacyOwnerKey(owner: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw unavailable();
  return ownerKey(digest(owner));
}
export const privacyLinkKey = (shareId: string) => `arrakis:{privacy}:v1:link:${digest(shareId)}`;
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
async function readKey(key: string, touch: boolean): Promise<PrivacyRecord | null> {
  try {
    const value = await redis().eval(READ, [key], [MAX_BYTES, touch ? RETENTION : 0]);
    if (value === '') return null;
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw unavailable();
    const parsed = privacyRecordSchema.parse(JSON.parse(value));
    if (!parsed.revision || !parsed.shareId) throw unavailable();
    return parsed;
  } catch {
    throw unavailable();
  }
}
export async function readPrivacy(owner: string): Promise<PrivacyRecord> {
  return (await readKey(privacyOwnerKey(owner), true)) ?? emptyPrivacy();
}
function applyCard(
  next: PrivacyRecord,
  card: PrivacyCard,
  publishTimes: { publishedAt: string; expiresAt: string } | null,
) {
  switch (card.category) {
    case 'profile':
      next.drafts.profile = card.data;
      if (publishTimes) next.publications.profile = { data: card.data, ...publishTimes };
      break;
    case 'location':
      next.drafts.location = card.data;
      if (publishTimes) next.publications.location = { data: card.data, ...publishTimes };
      break;
    case 'crafting':
      next.drafts.crafting = card.data;
      if (publishTimes) next.publications.crafting = { data: card.data, ...publishTimes };
      break;
    case 'supply':
      next.drafts.supply = card.data;
      if (publishTimes) next.publications.supply = { data: card.data, ...publishTimes };
      break;
  }
}
export async function mutatePrivacy(owner: string, raw: PrivacyInput): Promise<PrivacyRecord> {
  const checked = privacyInputSchema.safeParse(raw);
  if (!checked.success)
    throw new AppError(
      'Check the sharing card, expiry and explicit publication confirmation.',
      400,
      'INVALID_PRIVACY',
      true,
    );
  const input = checked.data;
  const previous = await readPrivacy(owner);
  const conflict = () =>
    new AppError(
      'Privacy settings changed. Reload before trying again. Your draft is kept.',
      409,
      'PRIVACY_CONFLICT',
      true,
    );
  if (previous.revision !== input.revision) throw conflict();
  const next = structuredClone(previous);
  next.revision = randomUUID();
  next.shareId ??= randomBytes(32).toString('hex');
  if (input.action === 'save-draft') applyCard(next, input.card, null);
  else if (input.action === 'publish') {
    const now = Date.now();
    applyCard(next, input.card, {
      publishedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + input.hours * 3600000).toISOString(),
    });
  } else if (input.action === 'unpublish') next.publications[input.category] = null;
  else {
    next.shareId = randomBytes(32).toString('hex');
    if (input.action === 'revoke-all')
      next.publications = { profile: null, location: null, crafting: null, supply: null };
  }
  return writePrivacy(owner, previous, next);
}
/** Content deletion also replaces routing, so old member links cannot expose retained snapshots. */
export async function erasePrivacy(owner: string, expected: string | null): Promise<PrivacyRecord> {
  const previous = await readPrivacy(owner);
  if (previous.revision !== expected)
    throw new AppError('Sharing data changed. Reload before deleting.', 409, 'PRIVACY_CONFLICT', true);
  return writePrivacy(owner, previous, {
    ...emptyPrivacy(),
    revision: randomUUID(),
    shareId: randomBytes(32).toString('hex'),
  });
}
async function writePrivacy(owner: string, previous: PrivacyRecord, next: PrivacyRecord): Promise<PrivacyRecord> {
  const record = privacyRecordSchema.parse(next);
  const serialized = JSON.stringify(record);
  if (Buffer.byteLength(serialized) > MAX_BYTES)
    throw new AppError('The sharing drafts exceed the storage limit.', 400, 'PRIVACY_TOO_LARGE', true);
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [privacyOwnerKey(owner), privacyLinkKey(previous.shareId ?? record.shareId!), privacyLinkKey(record.shareId!)],
      [previous.revision ?? '', serialized, RETENTION, MAX_BYTES, previous.shareId ?? '', digest(owner)],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict')
    throw new AppError('Sharing data changed. Reload before trying again.', 409, 'PRIVACY_CONFLICT', true);
  if (reply !== 'ok') throw unavailable();
  return record;
}
export async function readSharedPrivacy(shareId: string) {
  if (!/^[a-f0-9]{64}$/.test(shareId)) throw missing();
  let hash: unknown;
  try {
    hash = await redis().eval(INDEX, [privacyLinkKey(shareId)], []);
  } catch {
    throw unavailable();
  }
  if (hash === '') throw missing();
  if (typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)) throw unavailable();
  const record = await readKey(ownerKey(hash), false);
  if (!record || record.shareId !== shareId) throw missing();
  const view = publicPrivacyView(record, Date.now());
  if (!view) throw missing();
  return view;
}
