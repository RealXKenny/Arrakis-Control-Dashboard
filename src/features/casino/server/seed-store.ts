import '../../../lib/assert-server';
import { randomBytes } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { casinoRoundKeys } from '../../../lib/redis/keys';
import { engineError, type SeedAllocation } from '../engine/types';
import type { SeedPort } from '../engine/round';
import { CLIENT_SEED_PATTERN, commitSeed, generateServerSeed } from '../fairness/rng';

/**
 * Per-account provably fair seed pair in Redis.
 *
 * The active server seed never leaves this module except to the round engine (server-side). Clients
 * see only the commitment, their client seed and the next nonce. A seed is revealed only when it is
 * rotated, and rotation is refused while any round is open on it, so a seed that guards hidden game
 * state (Mines, Blackjack shoe, Crash point) cannot be revealed mid-round.
 */

const ID = /^[A-Za-z0-9_.-]{1,64}$/;

const ALLOCATE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'serverSeed', ARGV[1], 'commitment', ARGV[2], 'clientSeed', ARGV[3], 'nonce', 0)
end
local nonce = redis.call('HGET', KEYS[3], ARGV[4])
if not nonce then
  nonce = redis.call('HINCRBY', KEYS[1], 'nonce', 1) - 1
  redis.call('HSET', KEYS[3], ARGV[4], nonce)
end
redis.call('SADD', KEYS[2], ARGV[4])
return {
  redis.call('HGET', KEYS[1], 'serverSeed'),
  redis.call('HGET', KEYS[1], 'commitment'),
  redis.call('HGET', KEYS[1], 'clientSeed'),
  tostring(nonce),
}
`;

const ROTATE_SCRIPT = `
if redis.call('SCARD', KEYS[2]) > 0 then return {'ROUND_OPEN'} end
local old = redis.call('HGET', KEYS[1], 'serverSeed')
local result = {'OK', '', '', ''}
local client = ARGV[3]
if old then
  local commitment = redis.call('HGET', KEYS[1], 'commitment')
  local used = redis.call('HGET', KEYS[1], 'nonce')
  redis.call('LPUSH', KEYS[4], commitment .. '|' .. old .. '|' .. used)
  redis.call('LTRIM', KEYS[4], 0, 199)
  result = {'OK', old, commitment, used}
  if client == '' then client = redis.call('HGET', KEYS[1], 'clientSeed') end
end
if client == '' then client = ARGV[4] end
redis.call('DEL', KEYS[1], KEYS[3])
redis.call('HSET', KEYS[1], 'serverSeed', ARGV[1], 'commitment', ARGV[2], 'clientSeed', client, 'nonce', 0)
return result
`;

const SET_CLIENT_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 0 then
  redis.call('HSET', KEYS[1], 'serverSeed', ARGV[2], 'commitment', ARGV[3], 'nonce', 0)
end
redis.call('HSET', KEYS[1], 'clientSeed', ARGV[1])
return 1
`;

function client() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('Fairness is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}

function check(owner: string, server: string) {
  if (!ID.test(owner) || !ID.test(server)) throw engineError('INVALID_REQUEST', 'Invalid account');
}

const freshClientSeed = () => randomBytes(8).toString('hex');

export const seedStore: SeedPort = {
  async allocate(owner, server, roundId): Promise<SeedAllocation> {
    check(owner, server);
    if (!ID.test(roundId)) throw engineError('INVALID_REQUEST', 'Invalid round');
    const seed = generateServerSeed();
    const result = await client().eval(
      ALLOCATE_SCRIPT,
      [
        casinoRoundKeys.seeds(owner, server),
        casinoRoundKeys.seedsOpen(owner, server),
        casinoRoundKeys.seedsAlloc(owner, server),
      ],
      [seed, commitSeed(seed), freshClientSeed(), roundId],
    );
    if (!Array.isArray(result) || result.length !== 4) throw new Error('Unexpected seed response');
    return {
      serverSeed: String(result[0]),
      commitment: String(result[1]),
      clientSeed: String(result[2]),
      nonce: Number(result[3]),
    };
  },
  async release(owner, server, roundId) {
    check(owner, server);
    await client().command(['SREM', casinoRoundKeys.seedsOpen(owner, server), roundId]);
  },
};

/** Rounds currently holding this account's active seed (set in `allocate`, cleared in `release`). */
export async function openRoundCount(owner: string, server: string): Promise<number> {
  check(owner, server);
  const count = await client().command(['SCARD', casinoRoundKeys.seedsOpen(owner, server)]);
  return Number.isFinite(Number(count)) ? Number(count) : 0;
}

export type PublicSeedState = {
  commitment: string | null;
  clientSeed: string | null;
  /** Number of rounds already played on the active seed. */
  nonce: number;
  /** Retired seeds, newest first. These are safe to publish: no round can still be using them. */
  revealed: Array<{ commitment: string; serverSeed: string; rounds: number }>;
};

/** Never includes the active server seed. */
export async function readPublicSeedState(owner: string, server: string): Promise<PublicSeedState> {
  check(owner, server);
  const redis = client();
  const raw = await redis.command(['HMGET', casinoRoundKeys.seeds(owner, server), 'commitment', 'clientSeed', 'nonce']);
  const [commitment, clientSeed, nonce] = Array.isArray(raw) ? raw : [null, null, null];
  const rows = await redis.command(['LRANGE', casinoRoundKeys.seedsRevealed(owner, server), 0, 49]);
  const revealed = (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const [c, s, n] = String(row).split('|');
    return c && s ? [{ commitment: c, serverSeed: s, rounds: Number(n ?? 0) }] : [];
  });
  return {
    commitment: commitment ? String(commitment) : null,
    clientSeed: clientSeed ? String(clientSeed) : null,
    nonce: Number(nonce ?? 0),
    revealed,
  };
}

/** Retire the active seed (revealing it) and start a new committed one. Refused while any round is open. */
export async function rotateSeed(owner: string, server: string, clientSeed?: string) {
  check(owner, server);
  if (clientSeed !== undefined && !CLIENT_SEED_PATTERN.test(clientSeed))
    throw engineError('INVALID_REQUEST', 'Invalid client seed');
  const next = generateServerSeed();
  const result = await client().eval(
    ROTATE_SCRIPT,
    [
      casinoRoundKeys.seeds(owner, server),
      casinoRoundKeys.seedsOpen(owner, server),
      casinoRoundKeys.seedsAlloc(owner, server),
      casinoRoundKeys.seedsRevealed(owner, server),
    ],
    [next, commitSeed(next), clientSeed ?? '', freshClientSeed()],
  );
  if (!Array.isArray(result)) throw new Error('Unexpected seed response');
  if (result[0] === 'ROUND_OPEN') throw engineError('ROUND_OPEN', 'Finish your open rounds before rotating seeds');
  return {
    revealed: result[1]
      ? { serverSeed: String(result[1]), commitment: String(result[2]), rounds: Number(result[3]) }
      : null,
    nextCommitment: commitSeed(next),
  };
}

/** Change the client seed for future rounds. It is recorded on each round, so past rounds stay verifiable. */
export async function setClientSeed(owner: string, server: string, clientSeed: string) {
  check(owner, server);
  if (!CLIENT_SEED_PATTERN.test(clientSeed)) throw engineError('INVALID_REQUEST', 'Invalid client seed');
  const seed = generateServerSeed();
  await client().eval(SET_CLIENT_SCRIPT, [casinoRoundKeys.seeds(owner, server)], [clientSeed, seed, commitSeed(seed)]);
}
