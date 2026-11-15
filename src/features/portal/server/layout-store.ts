import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import { portalLayoutRecordSchema, type PortalLayout, type PortalLayoutRecord } from '../layout';

const MAX_BYTES = 4096;
const RETENTION = 90 * 86400;
const READ = `-- portal-layout-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''
`;
const SAVE = `-- portal-layout-save-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
  local ok, record = pcall(cjson.decode, old)
  if not ok or type(record) ~= 'table' then return 'invalid' end
  if record.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'
`;
const unavailable = () =>
  new AppError(
    'Portal layout settings are unavailable. Your saved layout has not been changed.',
    503,
    'PORTAL_LAYOUT_UNAVAILABLE',
    true,
  );
export function portalLayoutKey(owner: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw unavailable();
  return `arrakis:portal-layout:v1:${createHash('sha256').update(owner).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
export async function readPortalLayout(owner: string): Promise<PortalLayoutRecord | null> {
  try {
    const value = await redis().eval(READ, [portalLayoutKey(owner)], [MAX_BYTES, RETENTION]);
    if (value === '') return null;
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw unavailable();
    const record = portalLayoutRecordSchema.parse(JSON.parse(value));
    if (!record.revision) throw unavailable();
    return record;
  } catch {
    throw unavailable();
  }
}
export async function savePortalLayout(
  owner: string,
  expected: string | null,
  layout: PortalLayout,
): Promise<PortalLayoutRecord> {
  const parsed = portalLayoutRecordSchema.safeParse({ revision: expected, layout });
  if (!parsed.success)
    throw new AppError(
      'Choose a valid portal layout with unique supported widgets.',
      400,
      'INVALID_PORTAL_LAYOUT',
      true,
    );
  const current = await readPortalLayout(owner);
  if ((current?.revision ?? null) !== expected)
    throw new AppError(
      'Your layout changed in another tab. Reload the saved layout before saving.',
      409,
      'PORTAL_LAYOUT_CONFLICT',
      true,
    );
  const next = { revision: randomUUID(), layout: parsed.data.layout };
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [portalLayoutKey(owner)],
      [expected ?? '', JSON.stringify(next), RETENTION, MAX_BYTES],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict')
    throw new AppError(
      'Your layout changed in another tab. Reload the saved layout before saving.',
      409,
      'PORTAL_LAYOUT_CONFLICT',
      true,
    );
  if (reply !== 'ok') throw unavailable();
  return next;
}
