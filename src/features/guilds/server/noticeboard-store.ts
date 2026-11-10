import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import { AppError } from '../../../lib/errors';
import {
  emptyNoticeboard,
  noticeboardGuildId,
  noticeboardInputSchema,
  noticeboardSchema,
  NOTICE_LIMIT,
  PINNED_NOTICE_LIMIT,
  type NoticeboardInput,
} from '../noticeboard';

const MAX_BYTES = 262_144;
const RETENTION_SECONDS = 90 * 24 * 60 * 60;
const READ = `
-- guild-noticeboard-read
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
return redis.call('GET', KEYS[1]) or ''
`;
const SAVE = `
-- guild-noticeboard-save
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[4]) then return 'invalid' end
local old = redis.call('GET', KEYS[1])
if old then
  local ok, board = pcall(cjson.decode, old)
  if not ok or type(board) ~= 'table' then return 'invalid' end
  if board.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'
`;
function storage() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Guild noticeboard storage is unavailable.', 503, 'NOTICEBOARD_UNAVAILABLE', true);
  return redis;
}
export async function readNoticeboard(guildId: string) {
  noticeboardGuildId.parse(guildId);
  const raw = await storage().eval(READ, [guildKeys.noticeboard(guildId)], [MAX_BYTES]);
  if (raw === '') return emptyNoticeboard(guildId);
  if (typeof raw !== 'string' || raw.length > MAX_BYTES) throw new Error('Invalid noticeboard storage.');
  const board = noticeboardSchema.parse(JSON.parse(raw));
  if (board.guildId !== guildId) throw new Error('Invalid noticeboard ownership.');
  return board;
}
export async function saveNoticeboard(guildId: string, input: NoticeboardInput, authorName: string) {
  const change = noticeboardInputSchema.parse(input);
  const current = await readNoticeboard(guildId);
  const conflict = () =>
    new AppError(
      'This noticeboard changed. Refresh before saving again. Your draft has been kept.',
      409,
      'NOTICEBOARD_CONFLICT',
      true,
    );
  if (current.revision !== change.revision) throw conflict();
  const next = { ...current, revision: randomUUID() };
  if (change.action === 'settings') {
    next.message = change.message;
    next.priorities = change.priorities;
  } else if (change.action === 'delete-post') {
    if (!current.posts.some((post) => post.id === change.id)) throw conflict();
    next.posts = current.posts.filter((post) => post.id !== change.id);
  } else {
    const remaining = current.posts.filter((post) => post.id !== change.post.id);
    if (remaining.length >= NOTICE_LIMIT)
      throw new AppError(
        `Keep at most ${NOTICE_LIMIT} announcements. Remove an older one first.`,
        409,
        'NOTICEBOARD_FULL',
        true,
      );
    if (change.post.pinned && remaining.filter((post) => post.pinned).length >= PINNED_NOTICE_LIMIT)
      throw new AppError(`Pin at most ${PINNED_NOTICE_LIMIT} announcements.`, 409, 'NOTICEBOARD_PINS_FULL', true);
    next.posts = [...remaining, { ...change.post, authorName, updatedAt: new Date().toISOString() }].sort(
      (a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt),
    );
  }
  const encoded = JSON.stringify(noticeboardSchema.parse(next));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('Noticeboard storage is full.', 409, 'NOTICEBOARD_FULL', true);
  // Dev note: two leaders can share a guild, but they should not overwrite each other's spice memo.
  const result = await storage().eval(
    SAVE,
    [guildKeys.noticeboard(guildId)],
    [change.revision ?? '', encoded, RETENTION_SECONDS, MAX_BYTES],
  );
  if (result === 'conflict') throw conflict();
  if (result !== 'ok') throw new Error('Unable to confirm noticeboard save.');
  return next;
}
