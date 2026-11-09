import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { casinoRoundKeys } from '../../../lib/redis/keys';
import { engineError, type RoundRecord, type RoundRef } from '../engine/types';
import type { RoundStorePort } from '../engine/round';

/**
 * Durable rounds in Redis. The record is JSON; `version` and `status` live in their own hash fields
 * so the compare-and-set Lua script needs no JSON parsing. The record (including hidden game state)
 * is never returned to clients: routes must go through `toView`.
 */

const ID = /^[A-Za-z0-9_.-]{1,80}$/;
const MAX_OPEN_SCAN = 200;
const TERMINAL = new Set(['settled', 'voided']);

const CREATE_SCRIPT = `
if redis.call('HSETNX', KEYS[1], 'version', ARGV[1]) == 1 then
  redis.call('HSET', KEYS[1], 'status', ARGV[2], 'json', ARGV[3])
  redis.call('LPUSH', KEYS[2], ARGV[4])
  redis.call('LTRIM', KEYS[2], 0, 999)
  return {'NEW'}
end
return {'EXISTS', redis.call('HGET', KEYS[1], 'json')}
`;

const CAS_SCRIPT = `
local version = redis.call('HGET', KEYS[1], 'version')
if not version then return 'MISSING' end
local status = redis.call('HGET', KEYS[1], 'status')
if version ~= ARGV[1] or status ~= ARGV[2] then return 'CONFLICT' end
redis.call('HSET', KEYS[1], 'version', ARGV[3], 'status', ARGV[4], 'json', ARGV[5])
return 'OK'
`;

function client() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Games are unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}

function check(ref: RoundRef) {
  if (![ref.owner, ref.server, ref.id].every((part) => ID.test(part)))
    throw engineError('INVALID_REQUEST', 'Invalid identifier');
}

const member = (ref: RoundRef) => `${ref.owner}|${ref.server}|${ref.id}`;

function parse(json: unknown): RoundRecord {
  const value = JSON.parse(String(json)) as RoundRecord;
  if (!value || typeof value.id !== 'string' || typeof value.version !== 'number')
    throw new Error('Corrupt round record');
  return value;
}

export const roundStore: RoundStorePort = {
  async create(round) {
    check(round);
    const redis = client();
    const result = await redis.eval(
      CREATE_SCRIPT,
      [casinoRoundKeys.round(round.owner, round.server, round.id), casinoRoundKeys.index(round.owner, round.server)],
      [round.version, round.status, JSON.stringify(round), round.id],
    );
    if (!Array.isArray(result)) throw new Error('Unexpected round store response');
    if (result[0] !== 'NEW') return { round: parse(result[1]), created: false };
    await redis.command(['ZADD', casinoRoundKeys.open, round.createdAt, member(round)]);
    return { round, created: true };
  },

  async get(ref) {
    check(ref);
    const json = await client().command(['HGET', casinoRoundKeys.round(ref.owner, ref.server, ref.id), 'json']);
    return json ? parse(json) : null;
  },

  async cas(round, patch) {
    check(round);
    const redis = client();
    const next: RoundRecord = { ...round, ...patch, version: round.version + 1 };
    const result = await redis.eval(
      CAS_SCRIPT,
      [casinoRoundKeys.round(round.owner, round.server, round.id)],
      [round.version, round.status, next.version, next.status, JSON.stringify(next)],
    );
    if (result === 'MISSING') throw engineError('NOT_FOUND', 'Unknown round');
    if (result !== 'OK') throw engineError('STATE_CONFLICT', 'Round already advanced');
    if (TERMINAL.has(next.status)) await redis.command(['ZREM', casinoRoundKeys.open, member(round)]);
    else await redis.command(['ZADD', casinoRoundKeys.open, next.updatedAt, member(round)]);
    return next;
  },

  async listOpen(offset = 0, limit = MAX_OPEN_SCAN) {
    const start = Math.max(0, Math.trunc(offset));
    const rows = await client().command([
      'ZRANGE',
      casinoRoundKeys.open,
      start,
      start + Math.min(Math.max(limit, 1), MAX_OPEN_SCAN) - 1,
    ]);
    return (Array.isArray(rows) ? rows : []).flatMap((row) => {
      const [owner, server, id] = String(row).split('|');
      return owner && server && id ? [{ owner, server, id }] : [];
    });
  },

  async forget(ref) {
    check(ref);
    await client().command(['ZREM', casinoRoundKeys.open, member(ref)]);
  },
};

/** The caller's own rounds, newest first. Owner and server must be session-derived. */
export async function listRounds(owner: string, server: string, limit = 25): Promise<RoundRecord[]> {
  check({ owner, server, id: 'x' });
  const ids = await client().command([
    'LRANGE',
    casinoRoundKeys.index(owner, server),
    0,
    Math.min(Math.max(limit, 1), 100) - 1,
  ]);
  const rows = await Promise.all(
    (Array.isArray(ids) ? ids : []).map((id) => roundStore.get({ owner, server, id: String(id) })),
  );
  return rows.filter((row): row is RoundRecord => row !== null);
}
