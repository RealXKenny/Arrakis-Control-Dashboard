import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getRedisClient } from '../../../lib/redis/client';
import { guildKeys } from '../../../lib/redis/keys';
import { AppError } from '../../../lib/errors';
import {
  GUILD_POLL_LIMIT,
  POLL_VOTER_LIMIT,
  pollGuildId,
  pollInputSchema,
  storedPollSchema,
  type PollInput,
  type StoredPoll,
} from '../polls';

const MAX_BYTES = 131_072;
const RETENTION = 90 * 86_400;
const READ = `
-- guild-polls-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
return redis.call('HGETALL', KEYS[1])
`;
const SAVE = `
-- guild-polls-save
local old = redis.call('HGET', KEYS[1], ARGV[1])
if old then
  local ok, poll = pcall(cjson.decode, old)
  if not ok or type(poll) ~= 'table' then return 'invalid' end
  if poll.revision ~= ARGV[2] then return 'conflict' end
elseif ARGV[2] ~= '' then return 'conflict'
elseif redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
if ARGV[4] == 'vote' or ARGV[4] == 'withdraw' or ARGV[4] == 'create' then
  if now >= tonumber(ARGV[7]) then return 'closed' end
end
if ARGV[4] == 'delete' then redis.call('HDEL', KEYS[1], ARGV[1])
else redis.call('HSET', KEYS[1], ARGV[1], ARGV[3]) end
if redis.call('HLEN', KEYS[1]) == 0 then redis.call('DEL', KEYS[1])
else redis.call('EXPIRE', KEYS[1], math.max(redis.call('TTL', KEYS[1]), tonumber(ARGV[6]))) end
return 'ok'
`;
const unavailable = () =>
  new AppError('Guild polls are unavailable. Refresh before trying again.', 503, 'POLLS_UNAVAILABLE', true);
const conflict = () =>
  new AppError('This poll changed. Refresh before trying again. Your draft is kept.', 409, 'POLL_CONFLICT', true);
const closed = () => new AppError('This poll is closed. Votes can no longer change.', 409, 'POLL_CLOSED', true);
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
export async function readGuildPolls(guildId: string): Promise<StoredPoll[]> {
  pollGuildId.parse(guildId);
  try {
    const raw = await storage().eval(READ, [guildKeys.polls(guildId)], [GUILD_POLL_LIMIT, MAX_BYTES]);
    if (!Array.isArray(raw) || raw.length % 2 || raw.length > GUILD_POLL_LIMIT * 2) throw unavailable();
    const polls: StoredPoll[] = [];
    for (let index = 0; index < raw.length; index += 2) {
      if (typeof raw[index + 1] !== 'string' || Buffer.byteLength(raw[index + 1]) > MAX_BYTES) throw unavailable();
      const poll = storedPollSchema.parse(JSON.parse(raw[index + 1]));
      if (poll.id !== raw[index]) throw unavailable();
      polls.push(poll);
    }
    return polls.sort((a, b) => a.closesAt.localeCompare(b.closesAt) || a.id.localeCompare(b.id));
  } catch {
    throw unavailable();
  }
}
export function guildPollView(poll: StoredPoll, memberId: string, now = Date.now()) {
  const { votes, ...fields } = poll;
  return {
    ...fields,
    closed: poll.status === 'closed' || Date.parse(poll.closesAt) <= now,
    ownOptionId: votes.find((vote) => vote.memberId === memberId)?.optionId ?? null,
    totalVotes: votes.length,
    results: poll.options.map((option) => ({
      optionId: option.id,
      count: votes.filter((vote) => vote.optionId === option.id).length,
    })),
  };
}
export async function mutateGuildPoll(
  guildId: string,
  input: PollInput,
  actor: { memberId: string; canEdit: boolean; authorName: string },
) {
  pollGuildId.parse(actor.memberId);
  const change = pollInputSchema.parse(input);
  if (['create', 'close', 'delete'].includes(change.action) && !actor.canEdit)
    throw new AppError('Only the guild leader can manage polls.', 403, 'GUILD_LEADER_REQUIRED', true);
  const polls = await readGuildPolls(guildId);
  const id = change.action === 'create' ? change.poll.id : change.id;
  const current = polls.find((poll) => poll.id === id);
  const expected = change.action === 'create' ? null : change.revision;
  if ((current?.revision ?? null) !== expected) throw conflict();
  const now = Date.now();
  let next: StoredPoll;
  if (change.action === 'create') {
    const deadline = Date.parse(change.poll.closesAt);
    if (deadline <= now || deadline > now + 90 * 86_400_000)
      throw new AppError('Choose a future closing time within 90 days.', 400, 'INVALID_POLL_TIME', true);
    next = {
      ...change.poll,
      revision: randomUUID(),
      status: 'open',
      organizerName: actor.authorName,
      createdAt: new Date(now).toISOString(),
      votes: [],
    };
  } else {
    if (!current) throw conflict();
    next = { ...current, revision: randomUUID(), votes: [...current.votes] };
    if (change.action === 'close') {
      if (current.status === 'closed' || Date.parse(current.closesAt) <= now) throw closed();
      next.status = 'closed';
    } else if (change.action === 'vote' || change.action === 'withdraw') {
      if (current.status === 'closed' || Date.parse(current.closesAt) <= now) throw closed();
      next.votes = current.votes.filter((vote) => vote.memberId !== actor.memberId);
      if (change.action === 'vote') {
        if (!current.options.some((option) => option.id === change.optionId))
          throw new AppError("Choose one of this poll's options.", 400, 'INVALID_POLL_OPTION', true);
        if (next.votes.length >= POLL_VOTER_LIMIT)
          throw new AppError('This poll has reached its voter limit.', 409, 'POLL_FULL', true);
        next.votes.push({ memberId: actor.memberId, optionId: change.optionId });
      }
    }
  }
  const encoded = JSON.stringify(storedPollSchema.parse(next));
  if (Buffer.byteLength(encoded) > MAX_BYTES)
    throw new AppError('This poll has reached its storage limit.', 409, 'POLL_FULL', true);
  // Dev note: one character gets one ballot, even if they arrive with a whole sandcrawler of accounts.
  let result: unknown;
  try {
    result = await storage().eval(
      SAVE,
      [guildKeys.polls(guildId)],
      [
        id,
        expected ?? '',
        encoded,
        change.action,
        GUILD_POLL_LIMIT,
        Math.max(RETENTION, Math.ceil((Date.parse(next.closesAt) - now) / 1000) + RETENTION),
        Date.parse(next.closesAt),
      ],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw conflict();
  if (result === 'closed') throw closed();
  if (result === 'full')
    throw new AppError('Keep at most 20 polls. Remove an older poll first.', 409, 'POLLS_FULL', true);
  if (result !== 'ok') throw unavailable();
  return change.action === 'delete' ? null : next;
}
