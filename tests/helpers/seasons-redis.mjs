// Disposable fixture only: mirrors CAS responses for UI tests; does not execute or verify Redis Lua.
export function createSeasonFixture() {
  const strings = new Map();
  const sorted = new Map();
  const hashes = new Map();
  const lists = new Map();
  const zadd = (key, id, score) => {
    const set = sorted.get(key) ?? new Map();
    set.set(id, score);
    sorted.set(key, set);
  };
  return function seasonReply(operation, key, args) {
    const op = operation.toUpperCase();
    if (op === 'EVAL' && key.includes('community-seasons:commit-v1')) {
      const count = Number(args[0]);
      const keys = args.slice(1, count + 1);
      const [inputRaw, audit] = args.slice(count + 1);
      const input = JSON.parse(inputRaw);
      const n = input.expected.length;
      if (input.expected.some((value, i) => (strings.get(keys[i]) ?? '') !== value)) return { value: 'conflict' };
      if (input.requireEmptyInbox && hashes.get(keys[n + 1])?.size) return { value: 'pending' };
      if (input.active && (Date.now() < input.active[0] || Date.now() >= input.active[1])) return { value: 'closed' };
      if (input.beforeDeadline && Date.now() >= input.beforeDeadline) return { value: 'closed' };
      input.values.forEach((value, i) => {
        if (value !== false) strings.set(keys[i], value);
      });
      if (input.index) zadd(keys[n], input.index.id, input.index.score);
      if (input.schedule) zadd(keys[n + 3], input.schedule.id, input.schedule.score);
      if (input.publish) zadd(keys[n + 5], input.publish.id, input.publish.score);
      if (input.inbox) {
        const inbox = hashes.get(keys[n + 1]) ?? new Map();
        if (input.inbox.remove) {
          inbox.delete(input.inbox.id);
          sorted.get(keys[n + 4])?.delete(input.inbox.id);
        } else {
          inbox.set(input.inbox.id, input.inbox.value);
          zadd(keys[n + 4], input.inbox.id, input.inbox.score);
        }
        hashes.set(keys[n + 1], inbox);
      }
      const entries = lists.get(keys[n + 2]) ?? [];
      entries.push(audit);
      lists.set(keys[n + 2], entries);
      return { value: 'ok' };
    }
    if (!key?.startsWith('arrakis:{seasons}:v1:')) return undefined;
    if (op === 'GET') return { value: strings.get(key) ?? null };
    if (op === 'HMGET') return { value: args.map((id) => hashes.get(key)?.get(id) ?? null) };
    if (op === 'LRANGE')
      return {
        value: (lists.get(key) ?? []).slice(Number(args[0]), Number(args[1]) === -1 ? undefined : Number(args[1]) + 1),
      };
    const entries = [...(sorted.get(key) ?? [])].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (op === 'ZRANGEBYSCORE')
      return {
        value: entries
          .filter((v) => v[1] >= Number(args[0]) && (args[1] === '+inf' || v[1] <= Number(args[1])))
          .slice(0, Number(args[4] ?? entries.length))
          .map((v) => v[0]),
      };
    if (op === 'ZRANGE' || op === 'ZREVRANGE')
      return {
        value: (op === 'ZREVRANGE' ? entries.reverse() : entries)
          .slice(Number(args[0]), Number(args[1]) + 1)
          .map((v) => v[0]),
      };
    return undefined;
  };
}
