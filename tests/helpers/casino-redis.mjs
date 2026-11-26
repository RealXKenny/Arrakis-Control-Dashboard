// Isolated browser fixture only; never used by the production runtime.
//
// The browser fixture's Redis is a tiny RESP server with no Lua engine. This module answers the commands and scripts
// the casino issues, with the same behaviour as the real scripts (ledger, seeds, rounds), so browser tests can drive
// the real pages, routes and engine. The scripts are identified by their text; everything is single-threaded, so each
// script is atomic exactly as in Redis. Equivalence with the Lua was checked separately against an independent model.

const db = new Map();
const hash = (key) => {
  if (!db.has(key)) db.set(key, { type: 'hash', value: new Map() });
  return db.get(key).value;
};
const list = (key) => {
  if (!db.has(key)) db.set(key, { type: 'list', value: [] });
  return db.get(key).value;
};
const set = (key) => {
  if (!db.has(key)) db.set(key, { type: 'set', value: new Set() });
  return db.get(key).value;
};
const zset = (key) => {
  if (!db.has(key)) db.set(key, { type: 'zset', value: new Map() });
  return db.get(key).value;
};
const fmt = (n) => String(n);

function ledger(keys, a) {
  const [acct, entries, idem, holds] = keys;
  const [typ, key, holdId, purpose, fp] = a;
  const amount = Number(a[5]);
  const payout = Number(a[6]);
  const [currency, owner, server] = [a[7], a[8], a[9]];
  const maxBalance = Number(a[10]);
  const maxTransfer = Number(a[11]);
  const prior = hash(idem).get(key);
  if (prior) return prior.split('|').at(-1) !== fp ? ['IDEMPOTENCY_CONFLICT'] : ['REPLAY', prior];
  if (currency !== 'solaris') return ['INVALID_OPERATION'];
  let dA = 0;
  let dR = 0;
  let closeAs = null;
  let hold = null;
  if (typ === 'deposit_credit') dA = amount;
  else if (typ === 'reserve') {
    if (purpose === 'withdrawal' && amount > maxTransfer) return ['INVALID_OPERATION'];
    if (hash(holds).has(holdId)) return ['HOLD_EXISTS'];
    [dA, dR] = [-amount, amount];
  } else {
    const raw = hash(holds).get(holdId);
    if (!raw) return ['HOLD_NOT_FOUND'];
    hold = raw.split('|');
    if (hold[2] !== 'open') return ['HOLD_CLOSED'];
    const held = Number(hold[1]);
    if (typ === 'release') [dA, dR, closeAs] = [held, -held, 'released'];
    else if (typ === 'settle') {
      if (hold[0] !== 'wager') return ['INVALID_OPERATION'];
      [dA, dR, closeAs] = [payout, -held, 'settled'];
    } else if (typ === 'withdrawal_finalize') {
      if (hold[0] !== 'withdrawal') return ['INVALID_OPERATION'];
      [dA, dR, closeAs] = [0, -held, 'settled'];
    } else return ['INVALID_OPERATION'];
  }
  const account = hash(acct);
  const available = Number(account.get('available') ?? 0);
  const reserved = Number(account.get('reserved') ?? 0);
  const [nA, nR] = [available + dA, reserved + dR];
  if (nA < 0 || nR < 0) return ['INSUFFICIENT_FUNDS'];
  if (nA > maxBalance || nR > maxBalance) return ['BALANCE_LIMIT'];
  const seq = Number(account.get('seq') ?? 0) + 1;
  account.set('seq', fmt(seq));
  for (const [field, value] of [
    ['available', fmt(nA)],
    ['reserved', fmt(nR)],
    ['owner', owner],
    ['server', server],
    ['currency', currency],
  ])
    account.set(field, value);
  if (typ === 'reserve') hash(holds).set(holdId, `${purpose}|${fmt(amount)}|open`);
  else if (closeAs) hash(holds).set(holdId, `${hold[0]}|${hold[1]}|${closeAs}`);
  const id = `tx:${owner}:${server}:${currency}:${key}`;
  const entry = [seq, id, key, typ, holdId !== '' ? holdId : '-', dA, dR, nA, nR, fp].join('|');
  list(entries).push(entry);
  hash(idem).set(key, entry);
  return ['OK', entry];
}

function allocate(keys, a) {
  const [seeds, open, alloc] = keys;
  const [seed, commitment, client, roundId] = a;
  const account = hash(seeds);
  if (account.size === 0)
    for (const [f, v] of [
      ['serverSeed', seed],
      ['commitment', commitment],
      ['clientSeed', client],
      ['nonce', '0'],
    ])
      account.set(f, v);
  let nonce = hash(alloc).get(roundId);
  if (nonce === undefined) {
    nonce = Number(account.get('nonce'));
    account.set('nonce', fmt(nonce + 1));
    hash(alloc).set(roundId, fmt(nonce));
  }
  set(open).add(roundId);
  return [account.get('serverSeed'), account.get('commitment'), account.get('clientSeed'), String(nonce)];
}

function rotate(keys, a) {
  const [seeds, open, alloc, revealed] = keys;
  if (set(open).size > 0) return ['ROUND_OPEN'];
  const account = hash(seeds);
  const old = account.get('serverSeed');
  let result = ['OK', '', '', ''];
  let client = a[2];
  if (old) {
    const [commitment, used] = [account.get('commitment'), account.get('nonce')];
    list(revealed).unshift(`${commitment}|${old}|${used}`);
    list(revealed).length = Math.min(list(revealed).length, 200);
    result = ['OK', old, commitment, used];
    if (client === '') client = account.get('clientSeed');
  }
  if (client === '') client = a[3];
  db.delete(seeds);
  db.delete(alloc);
  const fresh = hash(seeds);
  for (const [f, v] of [
    ['serverSeed', a[0]],
    ['commitment', a[1]],
    ['clientSeed', client],
    ['nonce', '0'],
  ])
    fresh.set(f, v);
  return result;
}

function setClient(keys, a) {
  const account = hash(keys[0]);
  if (account.size === 0)
    for (const [f, v] of [
      ['serverSeed', a[1]],
      ['commitment', a[2]],
      ['nonce', '0'],
    ])
      account.set(f, v);
  account.set('clientSeed', a[0]);
  return 1;
}

function createRound(keys, a) {
  const record = hash(keys[0]);
  if (!record.has('version')) {
    record.set('version', a[0]);
    record.set('status', a[1]);
    record.set('json', a[2]);
    list(keys[1]).unshift(a[3]);
    list(keys[1]).length = Math.min(list(keys[1]).length, 1000);
    return ['NEW'];
  }
  return ['EXISTS', record.get('json')];
}

function casRound(keys, a) {
  const record = hash(keys[0]);
  if (!record.has('version')) return 'MISSING';
  if (record.get('version') !== a[0] || record.get('status') !== a[1]) return 'CONFLICT';
  record.set('version', a[2]);
  record.set('status', a[3]);
  record.set('json', a[4]);
  return 'OK';
}

function createTransfer(keys, a) {
  const record = hash(keys[0]);
  if (!record.has('state')) {
    record.set('state', a[0]);
    record.set('json', a[1]);
    list(keys[1]).unshift(a[2]);
    list(keys[1]).length = Math.min(list(keys[1]).length, 1000);
    return ['NEW'];
  }
  return ['EXISTS', record.get('json')];
}

function casTransfer(keys, a) {
  const record = hash(keys[0]);
  const current = record.get('state');
  if (current === undefined) return 'MISSING';
  if (current !== a[0]) return current;
  record.set('state', a[1]);
  record.set('json', a[2]);
  return 'OK';
}

function pause(keys, a) {
  const account = hash(keys[0]);
  let current = Number(account.get('pausedUntil') ?? 0);
  if (Number(a[0]) > current) {
    account.set('pausedUntil', a[0]);
    current = Number(a[0]);
  }
  return String(current);
}

function evalScript(script, rest) {
  const count = Number(rest[0]);
  const keys = rest.slice(1, 1 + count);
  const argv = rest.slice(1 + count);
  if (script.includes('local acct, entries, keys, holds')) return ledger(keys, argv);
  if (script.includes("'HINCRBY', KEYS[1], 'nonce', 1")) return allocate(keys, argv);
  if (script.includes("SCARD', KEYS[2]) > 0")) return rotate(keys, argv);
  if (script.includes("'clientSeed', ARGV[1]\nreturn 1")) return setClient(keys, argv);
  if (script.includes("HSETNX', KEYS[1], 'version'")) return createRound(keys, argv);
  if (script.includes('version ~= ARGV[1] or status ~= ARGV[2]')) return casRound(keys, argv);
  if (script.includes("HSETNX', KEYS[1], 'state'")) return createTransfer(keys, argv);
  if (script.includes('if current ~= ARGV[1] then return current end')) return casTransfer(keys, argv);
  if (script.includes('pausedUntil')) return pause(keys, argv);
  return undefined;
}

const CASINO_KEY = /^arrakis:\{casino/;

/** Returns `{ value }` when the casino handles the command, otherwise undefined so the fixture carries on. */
export function casinoReply(operation, key, args) {
  const op = operation.toUpperCase();
  if (op === 'EVAL') {
    const value = evalScript(String(key), args);
    return value === undefined ? undefined : { value };
  }
  if (!CASINO_KEY.test(String(key))) return undefined;
  switch (op) {
    case 'HGET':
      return { value: hash(key).get(args[0]) ?? null };
    case 'HMGET':
      return { value: args.map((field) => hash(key).get(field) ?? null) };
    case 'LRANGE': {
      const items = list(key);
      let [from, to] = [Number(args[0]), Number(args[1])];
      if (from < 0) from = Math.max(items.length + from, 0);
      if (to < 0) to = items.length + to;
      return { value: items.slice(from, to + 1) };
    }
    case 'SCARD':
      return { value: set(key).size };
    case 'SREM':
      return { value: set(key).delete(args[0]) ? 1 : 0 };
    case 'ZADD':
      zset(key).set(args[1], Number(args[0]));
      return { value: 1 };
    case 'ZREM':
      return { value: zset(key).delete(args[0]) ? 1 : 0 };
    case 'ZRANGE': {
      const members = [...zset(key).entries()].sort((x, y) => x[1] - y[1]).map(([member]) => member);
      return { value: members.slice(Number(args[0]), Number(args[1]) + 1) };
    }
    default:
      return undefined;
  }
}
