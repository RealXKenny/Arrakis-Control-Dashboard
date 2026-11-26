import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { casinoTransferKeys } from '../../../lib/redis/keys';
import { transferError, type IntentPort } from '../transfers/service';
import { TERMINAL_STATES, type IntentRef, type TransferIntent } from '../transfers/types';

/**
 * Durable transfer intents in Redis. State changes are compare-and-set in Lua (state + JSON in one
 * hash), so two callers can never both advance the same step. A transfer joins the open set right
 * after creation, long before anything is sent to the Console, and leaves it only after a terminal
 * state, so a crash can leave a stale entry (the recovery sweep drops it) but never an unlisted
 * in-flight transfer. A crash between creation and listing only strands a `created` intent, which
 * has sent nothing and resumes when the client repeats its idempotency key.
 */

const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const MAX_OPEN_SCAN = 200;

const CREATE_SCRIPT = `
if redis.call('HSETNX', KEYS[1], 'state', ARGV[1]) == 1 then
  redis.call('HSET', KEYS[1], 'json', ARGV[2])
  redis.call('LPUSH', KEYS[2], ARGV[3])
  redis.call('LTRIM', KEYS[2], 0, 999)
  return {'NEW'}
end
return {'EXISTS', redis.call('HGET', KEYS[1], 'json')}
`;

const CAS_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'state')
if not current then return 'MISSING' end
if current ~= ARGV[1] then return current end
redis.call('HSET', KEYS[1], 'state', ARGV[2], 'json', ARGV[3])
return 'OK'
`;

function client() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Transfers are unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}

function member(ref: IntentRef) {
  return `${ref.owner}|${ref.server}|${ref.id}`;
}

function check(ref: IntentRef) {
  if (![ref.owner, ref.server, ref.id].every((part) => ID.test(part)))
    throw transferError('INVALID_REQUEST', 'Invalid identifier');
}

function parse(json: unknown): TransferIntent {
  const value = JSON.parse(String(json)) as TransferIntent;
  if (!value || typeof value.id !== 'string' || typeof value.amount !== 'string')
    throw new Error('Corrupt transfer record');
  return value;
}

export const transferStore: IntentPort = {
  async create(intent) {
    check(intent);
    const redis = client();
    const result = await redis.eval(
      CREATE_SCRIPT,
      [
        casinoTransferKeys.intent(intent.owner, intent.server, intent.id),
        casinoTransferKeys.index(intent.owner, intent.server),
      ],
      [intent.state, JSON.stringify(intent), intent.id],
    );
    if (!Array.isArray(result)) throw new Error('Unexpected transfer store response');
    if (result[0] !== 'NEW') return { intent: parse(result[1]), created: false };
    // Listed only for a NEW record, so a replay can never resurrect a finished transfer in the open set.
    await redis.command(['ZADD', casinoTransferKeys.open, intent.createdAt, member(intent)]);
    return { intent, created: true };
  },

  async get(ref) {
    check(ref);
    const json = await client().command(['HGET', casinoTransferKeys.intent(ref.owner, ref.server, ref.id), 'json']);
    return json ? parse(json) : null;
  },

  async transition(intent, to, patch = {}) {
    check(intent);
    const redis = client();
    const next: TransferIntent = { ...intent, ...patch, state: to };
    const result = await redis.eval(
      CAS_SCRIPT,
      [casinoTransferKeys.intent(intent.owner, intent.server, intent.id)],
      [intent.state, to, JSON.stringify(next)],
    );
    if (result === 'MISSING') throw transferError('NOT_FOUND', 'Unknown transfer');
    if (result !== 'OK') throw transferError('STATE_CONFLICT', 'Transfer already advanced');
    if (TERMINAL_STATES.has(to)) await redis.command(['ZREM', casinoTransferKeys.open, member(intent)]);
    else await redis.command(['ZADD', casinoTransferKeys.open, next.updatedAt, member(intent)]);
    return next;
  },

  async forget(ref) {
    check(ref);
    await client().command(['ZREM', casinoTransferKeys.open, member(ref)]);
  },

  async listOpen(offset = 0, limit = MAX_OPEN_SCAN) {
    const start = Math.max(0, Math.trunc(offset));
    const rows = await client().command([
      'ZRANGE',
      casinoTransferKeys.open,
      start,
      start + Math.min(Math.max(limit, 1), MAX_OPEN_SCAN) - 1,
    ]);
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const [owner, server, id] = String(row).split('|');
      return owner && server && id ? [{ owner, server, id }] : [];
    });
  },
};

/** The caller's own transfers, newest first. Owner and server must be session-derived. */
export async function listTransfers(owner: string, server: string, limit = 25): Promise<TransferIntent[]> {
  check({ owner, server, id: 'x' });
  const redis = client();
  const ids = await redis.command([
    'LRANGE',
    casinoTransferKeys.index(owner, server),
    0,
    Math.min(Math.max(limit, 1), 100) - 1,
  ]);
  const rows = await Promise.all(
    (Array.isArray(ids) ? ids : []).map((id) => transferStore.get({ owner, server, id: String(id) })),
  );
  return rows.filter((row): row is TransferIntent => row !== null);
}
