import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { casinoKeys } from '../../../lib/redis/keys';
import { MAX_BALANCE, MAX_TRANSFER, formatAmount, parseAmount } from '../ledger/amount';
import { LedgerError, type Currency, type EntryKind, type LedgerErrorCode, type Operation } from '../ledger/ledger';

/**
 * Redis-backed wallet. Each operation is ONE Lua script over keys sharing a `{casino:owner:server}`
 * hash tag, so it is atomic on standalone Redis and single-slot on Cluster. The rules mirror the
 * reference model in `../ledger/ledger.ts`; `tests/integration/redis-casino.test.ts` runs both
 * against each other on real Redis (opt-in).
 *
 * Redis Lua uses IEEE doubles, which are exact only below 2^53; MAX_BALANCE (9e15) guarantees that.
 * Entries are stored as `|`-delimited strings (no JSON in Lua). Identifiers must not contain `|`.
 */

const ID = /^[A-Za-z0-9_.-]{1,64}$/;

export type StoredEntry = {
  seq: number;
  id: string;
  idempotencyKey: string;
  kind: EntryKind;
  holdId: string | null;
  availableDelta: bigint;
  reservedDelta: bigint;
  availableAfter: bigint;
  reservedAfter: bigint;
  fingerprint: string;
};

export type WalletBalance = { available: bigint; reserved: bigint };

export const LEDGER_SCRIPT = `
local acct, entries, keys, holds = KEYS[1], KEYS[2], KEYS[3], KEYS[4]
local typ, key, holdId, purpose, fp = ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5]
local amount, payout = tonumber(ARGV[6]), tonumber(ARGV[7])
local currency, owner, server = ARGV[8], ARGV[9], ARGV[10]
local maxBalance, maxTransfer = tonumber(ARGV[11]), tonumber(ARGV[12])

local function fmt(n) return string.format('%.0f', n) end

local prior = redis.call('HGET', keys, key)
if prior then
  local fields = {}
  for part in string.gmatch(prior, '([^|]+)') do fields[#fields + 1] = part end
  if fields[#fields] ~= fp then return {'IDEMPOTENCY_CONFLICT'} end
  return {'REPLAY', prior}
end

if currency ~= 'solaris' then return {'INVALID_OPERATION'} end

local dA, dR, closeAs = 0, 0, nil
local hold = nil
if typ == 'deposit_credit' then
  dA = amount
elseif typ == 'reserve' then
  if purpose == 'withdrawal' and amount > maxTransfer then return {'INVALID_OPERATION'} end
  if redis.call('HEXISTS', holds, holdId) == 1 then return {'HOLD_EXISTS'} end
  dA, dR = -amount, amount
else
  local raw = redis.call('HGET', holds, holdId)
  if not raw then return {'HOLD_NOT_FOUND'} end
  hold = {}
  for part in string.gmatch(raw, '([^|]+)') do hold[#hold + 1] = part end
  if hold[3] ~= 'open' then return {'HOLD_CLOSED'} end
  local held = tonumber(hold[2])
  if typ == 'release' then
    dA, dR, closeAs = held, -held, 'released'
  elseif typ == 'settle' then
    if hold[1] ~= 'wager' then return {'INVALID_OPERATION'} end
    dA, dR, closeAs = payout, -held, 'settled'
  elseif typ == 'withdrawal_finalize' then
    if hold[1] ~= 'withdrawal' then return {'INVALID_OPERATION'} end
    dA, dR, closeAs = 0, -held, 'settled'
  else
    return {'INVALID_OPERATION'}
  end
end

local available = tonumber(redis.call('HGET', acct, 'available') or '0')
local reserved = tonumber(redis.call('HGET', acct, 'reserved') or '0')
local nextAvailable, nextReserved = available + dA, reserved + dR
if nextAvailable < 0 or nextReserved < 0 then return {'INSUFFICIENT_FUNDS'} end
if nextAvailable > maxBalance or nextReserved > maxBalance then return {'BALANCE_LIMIT'} end

local seq = redis.call('HINCRBY', acct, 'seq', 1)
redis.call('HSET', acct, 'available', fmt(nextAvailable), 'reserved', fmt(nextReserved),
  'owner', owner, 'server', server, 'currency', currency)
if typ == 'reserve' then
  redis.call('HSET', holds, holdId, purpose .. '|' .. fmt(amount) .. '|open')
elseif closeAs then
  redis.call('HSET', holds, holdId, hold[1] .. '|' .. hold[2] .. '|' .. closeAs)
end
local id = 'tx:' .. owner .. ':' .. server .. ':' .. currency .. ':' .. key
local entry = table.concat({
  tostring(seq), id, key, typ, (holdId ~= '' and holdId or '-'),
  fmt(dA), fmt(dR), fmt(nextAvailable), fmt(nextReserved), fp,
}, '|')
redis.call('RPUSH', entries, entry)
redis.call('HSET', keys, key, entry)
return {'OK', entry}
`;

function client() {
  const redis = getRedisClient();
  if (!redis) throw new AppError('The wallet is unavailable.', 503, 'STORAGE_UNAVAILABLE', true);
  return redis;
}

function scope(owner: string, server: string) {
  // The owner is a server-verified identity; this guard also keeps Redis hash tags unambiguous.
  if (!ID.test(owner) || !ID.test(server)) throw new LedgerError('ACCOUNT_MISMATCH', 'Invalid account identity');
}

function fingerprint(op: Operation): string {
  const { key: _key, ...rest } = op;
  const canonical = JSON.stringify(rest, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  return createHash('sha256').update(canonical).digest('hex').slice(0, 32);
}

export function parseEntry(raw: string): StoredEntry {
  const f = raw.split('|');
  if (f.length !== 10) throw new Error('Corrupt ledger entry');
  return {
    seq: Number(f[0]),
    id: f[1]!,
    idempotencyKey: f[2]!,
    kind: f[3] as EntryKind,
    holdId: f[4] === '-' ? null : f[4]!,
    availableDelta: BigInt(f[5]!),
    reservedDelta: BigInt(f[6]!),
    availableAfter: BigInt(f[7]!),
    reservedAfter: BigInt(f[8]!),
    fingerprint: f[9]!,
  };
}

const CODES = new Set<string>([
  'INSUFFICIENT_FUNDS',
  'IDEMPOTENCY_CONFLICT',
  'HOLD_EXISTS',
  'HOLD_NOT_FOUND',
  'HOLD_CLOSED',
  'ACCOUNT_MISMATCH',
  'BALANCE_LIMIT',
  'INVALID_OPERATION',
]);

/** Apply one ledger operation atomically. Replays return the original entry with `replayed: true`. */
export async function applyWalletOperation(
  owner: string,
  server: string,
  currency: Currency,
  op: Operation,
): Promise<{ entry: StoredEntry; replayed: boolean }> {
  scope(owner, server);
  if (!ID.test(op.key)) throw new LedgerError('INVALID_OPERATION', 'Invalid idempotency key');
  const holdId = 'holdId' in op ? op.holdId : '';
  if (holdId && !ID.test(holdId)) throw new LedgerError('INVALID_OPERATION', 'Invalid hold id');
  const amount =
    'amount' in op ? parseAmount(op.amount, op.type === 'deposit_credit' ? MAX_TRANSFER : MAX_BALANCE) : 0n;
  const payout = op.type === 'settle' ? op.payout : 0n;
  if (payout < 0n || payout > MAX_BALANCE) throw new LedgerError('INVALID_OPERATION', 'Invalid payout');
  const k = (fn: typeof casinoKeys.account) => fn(owner, server, currency);
  const result = await client().eval(
    LEDGER_SCRIPT,
    [k(casinoKeys.account), k(casinoKeys.entries), k(casinoKeys.idempotency), k(casinoKeys.holds)],
    [
      op.type,
      op.key,
      holdId,
      op.type === 'reserve' ? op.purpose : '',
      fingerprint(op),
      formatAmount(amount),
      formatAmount(payout),
      currency,
      owner,
      server,
      formatAmount(MAX_BALANCE),
      formatAmount(MAX_TRANSFER),
    ],
  );
  if (!Array.isArray(result) || typeof result[0] !== 'string') throw new Error('Unexpected ledger response');
  const status = result[0];
  if (status === 'OK' || status === 'REPLAY')
    return { entry: parseEntry(String(result[1])), replayed: status === 'REPLAY' };
  if (CODES.has(status)) throw new LedgerError(status as LedgerErrorCode, status);
  throw new Error('Unexpected ledger status');
}

export async function readWalletBalance(owner: string, server: string, currency: Currency): Promise<WalletBalance> {
  scope(owner, server);
  const raw = await client().command(['HMGET', casinoKeys.account(owner, server, currency), 'available', 'reserved']);
  const [available, reserved] = Array.isArray(raw) ? raw : [null, null];
  return { available: BigInt(String(available ?? '0')), reserved: BigInt(String(reserved ?? '0')) };
}

/** Newest-first page of the caller's own ledger entries. */
export async function listWalletEntries(
  owner: string,
  server: string,
  currency: Currency,
  limit = 25,
  offset = 0,
): Promise<StoredEntry[]> {
  scope(owner, server);
  const bounded = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const start = -(offset + bounded);
  const stop = -(offset + 1);
  const rows = await client().command(['LRANGE', casinoKeys.entries(owner, server, currency), start, stop]);
  return (Array.isArray(rows) ? rows : []).map((row) => parseEntry(String(row))).reverse();
}
