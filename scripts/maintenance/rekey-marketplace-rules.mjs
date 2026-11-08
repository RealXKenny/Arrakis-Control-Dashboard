/**
 * Marketplace owner-key migration: unkeyed SHA-256 owner keys -> HMAC owner keys (SEC-24).
 *
 * Plain ESM so the CLI (`npm run marketplace:rekey`) and the unit tests share it. The dashboard keeps working at
 * every step because it accepts both key generations; the migration only removes the guessable legacy keys.
 * Nothing is written unless `apply` is requested, every change is recorded in a backup that `rollback` can replay,
 * and Discord IDs are only used in memory to compute keys; they are never printed or stored.
 */
import { createHash, createHmac, hkdfSync } from 'node:crypto';

const NS = 'arrakis:{bm}:v2';
export const keys = {
  record: (id) => `${NS}:record:${id}`,
  state: (id) => `${NS}:state:${id}`,
  owner: (id) => `${NS}:owner:${id}`,
  userCount: (ownerKey) => `${NS}:user:${ownerKey}`,
  userBytes: (ownerKey) => `${NS}:bytes:${ownerKey}`,
  size: (id) => `${NS}:size:${id}`,
  index: `${NS}:index`,
};

function secret(env) {
  if (env.OWNER_KEY_SECRET) return Buffer.from(env.OWNER_KEY_SECRET, 'utf8');
  if (!env.AUTH_SECRET) throw new Error('OWNER_KEY_SECRET or AUTH_SECRET is required.');
  return Buffer.from(hkdfSync('sha256', env.AUTH_SECRET, 'arrakis-owner-key', 'marketplace-owner-v2', 32));
}

export function ownerKeyPair(discordId, env) {
  return {
    legacy: createHash('sha256').update(`base-marketplace-owner:${discordId}`).digest('hex').slice(0, 16),
    current: createHmac('sha256', secret(env)).update(`owner:v2:${discordId}`).digest('hex').slice(0, 16),
  };
}

/** Swap the owner key inside a stored JSON document without re-encoding it (JSON round trips can reshape data). */
export function swapOwnerKey(raw, from, to) {
  const needle = `"ownerKey":"${from}"`;
  return raw.includes(needle) ? raw.replace(needle, `"ownerKey":"${to}"`) : raw;
}

async function* scan(redis, match) {
  let cursor = '0';
  do {
    const [next, found] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 200);
    cursor = next;
    for (const key of found) yield key;
  } while (cursor !== '0');
}

/** Build the plan: which stored listings carry a legacy key whose owner is a known account. */
export async function planRekey(redis, env) {
  const legacyToCurrent = new Map();
  for await (const key of scan(redis, 'arrakis:auth:user:*')) {
    const discordId = key.slice('arrakis:auth:user:'.length);
    if (!/^\d{1,25}$/.test(discordId)) continue;
    const pair = ownerKeyPair(discordId, env);
    legacyToCurrent.set(pair.legacy, pair.current);
  }
  const current = new Set(legacyToCurrent.values());
  const moves = [];
  const unmatched = [];
  let listings = 0;
  const prefix = `${NS}:owner:`;
  for await (const key of scan(redis, `${prefix}*`)) {
    listings += 1;
    const id = key.slice(prefix.length);
    const owner = await redis.get(key);
    if (typeof owner !== 'string') continue;
    const target = legacyToCurrent.get(owner);
    if (target) moves.push({ id, from: owner, to: target });
    else if (!current.has(owner)) unmatched.push(id);
  }
  return { listings, moves, unmatched };
}

async function moveOne(redis, move, backup) {
  const { id, from, to } = move;
  const [record, state, owner] = await Promise.all([
    redis.get(keys.record(id)),
    redis.get(keys.state(id)),
    redis.get(keys.owner(id)),
  ]);
  if (owner !== from || typeof record !== 'string' || typeof state !== 'string') return 'skipped';
  backup.push({ id, from, to, record, state });
  const nextState = swapOwnerKey(state, from, to);
  const score = await redis.zscore(keys.index, state);
  // Order matters for crash safety: every intermediate state stays readable because both key generations are accepted.
  await redis.set(keys.record(id), swapOwnerKey(record, from, to));
  await redis.set(keys.state(id), nextState);
  if (score !== null) {
    await redis.zadd(keys.index, score, nextState);
    await redis.zrem(keys.index, state);
  }
  await redis.set(keys.owner(id), to);
  await adjust(redis, from, to, id);
  return 'moved';
}

async function adjust(redis, fromKey, toKey, id) {
  const count = Number((await redis.get(keys.userCount(fromKey))) ?? 0);
  if (count > 1) await redis.decr(keys.userCount(fromKey));
  else await redis.del(keys.userCount(fromKey));
  await redis.incr(keys.userCount(toKey));
  // Byte quotas follow the listing too (only listings published with a size record were ever counted).
  const size = Number((await redis.get(keys.size(id))) ?? 0);
  if (size > 0) {
    const held = Number((await redis.get(keys.userBytes(fromKey))) ?? 0);
    if (held > size) await redis.set(keys.userBytes(fromKey), String(held - size));
    else await redis.del(keys.userBytes(fromKey));
    await redis.set(keys.userBytes(toKey), String(Number((await redis.get(keys.userBytes(toKey))) ?? 0) + size));
  }
}

export async function applyRekey(redis, plan) {
  const backup = [];
  const result = { moved: 0, skipped: 0 };
  for (const move of plan.moves) result[(await moveOne(redis, move, backup)) === 'moved' ? 'moved' : 'skipped'] += 1;
  return { ...result, backup };
}

/** Undo a previous apply from its backup: restores the stored documents and moves the counters back. */
export async function rollbackRekey(redis, backup) {
  let restored = 0;
  for (const entry of backup) {
    const { id, from, to, record, state } = entry;
    const current = await redis.get(keys.state(id));
    if ((await redis.get(keys.owner(id))) !== to || typeof current !== 'string') continue;
    const score = await redis.zscore(keys.index, current);
    await redis.set(keys.record(id), record);
    await redis.set(keys.state(id), state);
    if (score !== null) {
      await redis.zadd(keys.index, score, state);
      await redis.zrem(keys.index, current);
    }
    await redis.set(keys.owner(id), from);
    await adjust(redis, to, from, id);
    restored += 1;
  }
  return { restored };
}
