import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { assistanceKeys } from '../../../lib/redis/keys';
import {
  HELP_MESSAGE_LIMIT,
  helpMessageInputSchema,
  helpMessageSchema,
  helpParticipant,
  type HelpMessage,
  type HelpRequest,
} from '../model';

const RETENTION_SECONDS = 90 * 86_400;
const READ = `-- assistance-messages-read
if redis.call('HLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
for _, id in ipairs(redis.call('HKEYS', KEYS[1])) do
  if redis.call('HSTRLEN', KEYS[1], id) > tonumber(ARGV[2]) then return false end
end
if redis.call('EXISTS', KEYS[1]) == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[3])) end
return redis.call('HGETALL', KEYS[1])
`;
const SEND = `-- assistance-message-send
local raw = redis.call('HGET', KEYS[2], ARGV[2])
if not raw then return 'missing' end
local ok, request = pcall(cjson.decode, raw)
if not ok or type(request) ~= 'table' then return 'invalid' end
if (request.owner ~= ARGV[3] and request.volunteerOwner ~= ARGV[3]) or
  (request.status ~= 'assigned' and request.status ~= 'in-progress') then return 'forbidden' end
if redis.call('HLEN', KEYS[1]) >= tonumber(ARGV[5]) then return 'full' end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[4])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[6]))
return 'ok'
`;

function unavailable() {
  return new AppError('Assistance chat is temporarily unavailable.', 503, 'ASSISTANCE_CHAT_UNAVAILABLE', true);
}
function storage() {
  const redis = getRedisClient();
  if (!redis) throw unavailable();
  return redis;
}
function participant(request: HelpRequest, owner: string) {
  if (!helpParticipant(request, owner) || !request.volunteerOwner || request.status === 'open')
    throw new AppError('You cannot access this assistance chat.', 403, 'ASSISTANCE_CHAT_FORBIDDEN', true);
}

export async function readHelpMessages(request: HelpRequest, owner: string): Promise<HelpMessage[]> {
  participant(request, owner);
  try {
    const values = await storage().eval(
      READ,
      [assistanceKeys.messages(request.id)],
      [HELP_MESSAGE_LIMIT, 2048, RETENTION_SECONDS],
    );
    if (!Array.isArray(values) || values.length % 2 || values.length > HELP_MESSAGE_LIMIT * 2) throw unavailable();
    const messages: HelpMessage[] = [];
    for (let index = 0; index < values.length; index += 2) {
      const raw = values[index + 1];
      if (typeof raw !== 'string') throw unavailable();
      const parsed = helpMessageSchema.parse(JSON.parse(raw));
      if (parsed.id !== values[index]) throw unavailable();
      messages.push(parsed);
    }
    return messages.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id));
  } catch {
    throw unavailable();
  }
}

export async function sendHelpMessage(request: HelpRequest, input: unknown, owner: string, authorName: string) {
  participant(request, owner);
  if (!['assigned', 'in-progress'].includes(request.status))
    throw new AppError('This assistance chat is closed.', 409, 'ASSISTANCE_CHAT_CLOSED', true);
  const parsed = helpMessageInputSchema.safeParse(input);
  if (!parsed.success)
    throw new AppError('Enter a message of 1 to 1000 characters.', 400, 'INVALID_HELP_MESSAGE', true);
  const next = helpMessageSchema.parse({
    id: randomUUID(),
    owner,
    authorName,
    body: parsed.data.body,
    sentAt: new Date().toISOString(),
  });
  let result: unknown;
  try {
    result = await storage().eval(
      SEND,
      [assistanceKeys.messages(request.id), assistanceKeys.requests],
      [next.id, request.id, owner, JSON.stringify(next), HELP_MESSAGE_LIMIT, RETENTION_SECONDS],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'full')
    throw new AppError('This assistance chat has reached its message limit.', 409, 'ASSISTANCE_CHAT_FULL', true);
  if (result !== 'ok') throw unavailable();
  return next;
}
