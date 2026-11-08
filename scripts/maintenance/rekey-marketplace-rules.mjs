/**
 * Marketplace owner-key migration: unkeyed SHA-256 owner keys -> HMAC owner keys (SEC-24).
 *
 * Plain ESM so the CLI (`npm run marketplace:rekey`) and the tests share it. The dashboard keeps working at every
 * step because it accepts both key generations; the migration only removes the guessable legacy keys.
 *
 * Safety properties (all exercised against a real Redis in tests/integration):
 *  - nothing is written unless `apply` is requested, and a backup of every affected document is taken first;
 *  - a listing's owner key is changed LAST, so an interrupted run leaves the listing still planned for the next run;
 *  - every step is idempotent, and the per-member counters are recomputed from the stored listings afterwards, so
 *    an interruption can never leave a counter inflated or negative;
 *  - `rollback` restores the backed-up documents whatever progress the apply made;
 *  - Discord IDs are only used in memory to compute keys; they are never printed or stored.
 *
 * Secret rotation: owner keys are an HMAC of the Discord ID under OWNER_KEY_SECRET. Changing that secret makes
 * every HMAC-owned listing unowned (nobody can delete it) until it is re-keyed. Put the old secret in
 * OWNER_KEY_PREVIOUS_SECRET (or AUTH_SECRET-derived keys via OWNER_KEY_PREVIOUS_AUTH_SECRET) and run this script.
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

function secretFrom({ ownerSecret, authSecret }) {
  if (ownerSecret) return Buffer.from(ownerSecret, 'utf8');
  if (!authSecret) return null;
  return Buffer.from(hkdfSync('sha256', authSecret, 'arrakis-owner-key', 'marketplace-owner-v2', 32));
}

const hmac = (secret, discordId) =>
  createHmac('sha256', secret).update(`owner:v2:${discordId}`).digest('hex').slice(0, 16);

export function ownerKeyPair(discordId, env) {
  const current = secretFrom({ ownerSecret: env.OWNER_KEY_SECRET, authSecret: env.AUTH_SECRET });
  if (!current) throw new Error('OWNER_KEY_SECRET or AUTH_SECRET is required.');
  const previous = secretFrom({
    ownerSecret: env.OWNER_KEY_PREVIOUS_SECRET,
    authSecret: env.OWNER_KEY_PREVIOUS_AUTH_SECRET,
  });
  return {
    legacy: createHash('sha256').update(`base-marketplace-owner:${discordId}`).digest('hex').slice(0, 16),
    current: hmac(current, discordId),
    previous: previous ? hmac(previous, discordId) : null,
  };
}

/** Swap the owner key inside a stored JSON document without re-encoding it (JSON round trips can reshape data). */
export function swapOwnerKey(raw, from, to) {
  const needle = `"ownerKey":"${from}"`;
  return raw.includes(needle) ? raw.replace(needle, `"ownerKey":"${to}"`) : raw;
}

/** SCAN is per node, so a Redis Cluster is walked master by master; a standalone client is one node. */
async function* scan(redis, match) {
  const nodes = typeof redis.nodes === 'function' ? redis.nodes('master') : [redis];
  for (const node of nodes) {
    let cursor = '0';
    do {
      const [next, found] = await node.scan(cursor, 'MATCH', match, 'COUNT', 200);
      cursor = next;
      for (const key of found) yield key;
    } while (cursor !== '0');
  }
}

/** Build the plan: which stored listings carry an outdated key whose owner is a known account. */
export async function planRekey(redis, env) {
  const outdatedToCurrent = new Map();
  const currentKeys = new Set();
  for await (const key of scan(redis, 'arrakis:auth:user:*')) {
    const discordId = key.slice('arrakis:auth:user:'.length);
    if (!/^\d{1,25}$/.test(discordId)) continue;
    const pair = ownerKeyPair(discordId, env);
    currentKeys.add(pair.current);
    outdatedToCurrent.set(pair.legacy, pair.current);
    if (pair.previous && pair.previous !== pair.current) outdatedToCurrent.set(pair.previous, pair.current);
  }
  const moves = [];
  const unmatched = [];
  let listings = 0;
  const prefix = `${NS}:owner:`;
  for await (const key of scan(redis, `${prefix}*`)) {
    listings += 1;
    const id = key.slice(prefix.length);
    const owner = await redis.get(key);
    if (typeof owner !== 'string') continue;
    const target = outdatedToCurrent.get(owner);
    if (target) moves.push({ id, from: owner, to: target });
    else if (!currentKeys.has(owner)) unmatched.push(id);
  }
  // Every key a known member may hold counters under: a resumed run must still tidy counters when no listing is left to move.
  const owners = [...outdatedToCurrent.keys(), ...currentKeys];
  return { listings, moves, unmatched, owners };
}

/** Capture what a rollback needs. Write this to disk BEFORE calling applyRekey. */
export async function backupRekey(redis, plan) {
  const backup = [];
  for (const { id, from, to } of plan.moves) {
    const [record, state] = await Promise.all([redis.get(keys.record(id)), redis.get(keys.state(id))]);
    if (typeof record === 'string' && typeof state === 'string') backup.push({ id, from, to, record, state });
  }
  return backup;
}

/** Recompute the per-member listing and byte counters from the listings that are actually stored. */
export async function reconcileCounters(redis, ownerKeysTouched) {
  const counts = new Map();
  const bytes = new Map();
  const prefix = `${NS}:owner:`;
  for await (const key of scan(redis, `${prefix}*`)) {
    const owner = await redis.get(key);
    if (typeof owner !== 'string' || !ownerKeysTouched.has(owner)) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
    const size = Number((await redis.get(keys.size(key.slice(prefix.length)))) ?? 0);
    if (Number.isFinite(size) && size > 0) bytes.set(owner, (bytes.get(owner) ?? 0) + size);
  }
  for (const owner of ownerKeysTouched) {
    if (counts.get(owner)) await redis.set(keys.userCount(owner), String(counts.get(owner)));
    else await redis.del(keys.userCount(owner));
    if (bytes.get(owner)) await redis.set(keys.userBytes(owner), String(bytes.get(owner)));
    else await redis.del(keys.userBytes(owner));
  }
}

async function relocate(redis, { id, from, to }, documents) {
  const [record, state, owner] = await Promise.all([
    redis.get(keys.record(id)),
    redis.get(keys.state(id)),
    redis.get(keys.owner(id)),
  ]);
  if (owner !== from || typeof record !== 'string' || typeof state !== 'string') return false;
  const fromState = documents?.state ?? swapOwnerKey(state, to, from);
  const toState = swapOwnerKey(fromState, from, to);
  // The index member is the state document itself; accept whichever form an interrupted run left behind.
  const score = (await redis.zscore(keys.index, fromState)) ?? (await redis.zscore(keys.index, toState));
  await redis.set(keys.record(id), swapOwnerKey(record, from, to));
  await redis.set(keys.state(id), toState);
  if (score !== null) {
    await redis.zadd(keys.index, score, toState);
    if (fromState !== toState) await redis.zrem(keys.index, fromState);
  }
  // Last: until this line the listing still belongs to `from` and is picked up again by the next run.
  await redis.set(keys.owner(id), to);
  return true;
}

export async function applyRekey(redis, plan) {
  const result = { moved: 0, skipped: 0 };
  const touched = new Set(plan.owners ?? []);
  for (const move of plan.moves) {
    if (await relocate(redis, move)) {
      result.moved += 1;
      touched.add(move.from);
      touched.add(move.to);
    } else result.skipped += 1;
  }
  await reconcileCounters(redis, touched);
  return result;
}

/** Undo from the backup, whatever progress an apply (or an interrupted apply) made. */
export async function rollbackRekey(redis, backup) {
  let restored = 0;
  const touched = new Set();
  for (const { id, from, to, record, state } of backup) {
    const current = await redis.get(keys.state(id));
    if (typeof current !== 'string') continue;
    const toState = swapOwnerKey(state, from, to);
    const score =
      (await redis.zscore(keys.index, current)) ??
      (await redis.zscore(keys.index, state)) ??
      (await redis.zscore(keys.index, toState));
    await redis.set(keys.record(id), record);
    await redis.set(keys.state(id), state);
    if (score !== null) {
      await redis.zadd(keys.index, score, state);
      for (const stale of new Set([current, toState])) if (stale !== state) await redis.zrem(keys.index, stale);
    }
    await redis.set(keys.owner(id), from);
    touched.add(from);
    touched.add(to);
    restored += 1;
  }
  await reconcileCounters(redis, touched);
  return { restored };
}
