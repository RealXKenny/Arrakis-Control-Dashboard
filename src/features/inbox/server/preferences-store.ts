import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { AppError } from '../../../lib/errors';
import {
  defaultNotifications,
  notificationInputSchema,
  notificationRecordSchema,
  type NotificationInput,
  type NotificationRecord,
} from '../preferences';
const MAX_BYTES = 65536;
const RETENTION = 90 * 86400;
const READ = `-- notification-preferences-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
if value then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
return value or ''`;
const SAVE = `-- notification-preferences-save-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
 local ok, value = pcall(cjson.decode, old)
 if not ok or type(value) ~= 'table' then return 'invalid' end
 if value.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'`;
const unavailable = () =>
  new AppError(
    'Notification settings are unavailable. Reload before making changes.',
    503,
    'NOTIFICATIONS_UNAVAILABLE',
    true,
  );
export function notificationKey(owner: string) {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(owner)) throw unavailable();
  return `arrakis:notifications:v1:${createHash('sha256').update(owner).digest('hex')}`;
}
function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}
export async function readNotifications(owner: string): Promise<NotificationRecord> {
  try {
    const value = await redis().eval(READ, [notificationKey(owner)], [MAX_BYTES, RETENTION]);
    if (value === '') return defaultNotifications();
    if (typeof value !== 'string' || Buffer.byteLength(value) > MAX_BYTES) throw unavailable();
    const parsed = notificationRecordSchema.parse(JSON.parse(value));
    if (!parsed.revision) throw unavailable();
    return parsed;
  } catch {
    throw unavailable();
  }
}
export async function mutateNotifications(owner: string, input: NotificationInput): Promise<NotificationRecord> {
  const checked = notificationInputSchema.safeParse(input);
  if (!checked.success)
    throw new AppError('Check notification settings and alert controls.', 400, 'INVALID_NOTIFICATIONS', true);
  input = checked.data;
  const old = await readNotifications(owner);
  const conflict = () =>
    new AppError(
      'Notification settings changed in another tab. Reload before trying again. Your draft is kept.',
      409,
      'NOTIFICATIONS_CONFLICT',
      true,
    );
  if (old.revision !== input.revision) throw conflict();
  const now = Date.now();
  const next = { ...old, revision: randomUUID() };
  if (input.action === 'configure') next.config = input.config;
  else {
    const existing = old.states.find((s) => s.id === input.id);
    next.states = old.states.filter((s) => s.id !== input.id);
    if (input.action !== 'restore') {
      const entry = {
        ...(existing ?? { id: input.id, dismissed: null, snoozedUntil: null, seenAt: null }),
        updatedAt: new Date(now).toISOString(),
      };
      if (input.action === 'dismiss') entry.dismissed = input.fingerprint;
      if (input.action === 'snooze') {
        entry.snoozedUntil = new Date(now + input.minutes * 60000).toISOString();
        entry.dismissed = null;
      }
      if (input.action === 'review') {
        entry.seenAt = new Date(now).toISOString();
        entry.dismissed = null;
        entry.snoozedUntil = null;
      }
      // Dev note: even mentats keep a bounded notebook; oldest controls retire first.
      next.states = [...next.states, entry].slice(-120);
    }
  }
  const serialized = JSON.stringify(notificationRecordSchema.parse(next));
  if (Buffer.byteLength(serialized) > MAX_BYTES) throw unavailable();
  let reply: unknown;
  try {
    reply = await redis().eval(
      SAVE,
      [notificationKey(owner)],
      [input.revision ?? '', serialized, RETENTION, MAX_BYTES],
    );
  } catch {
    throw unavailable();
  }
  if (reply === 'conflict') throw conflict();
  if (reply !== 'ok') throw unavailable();
  return next;
}
