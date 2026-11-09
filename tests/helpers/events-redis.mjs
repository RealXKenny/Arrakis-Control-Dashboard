// Isolated browser fixture only. Production executes the Lua scripts against Redis.
const records = new Map();
const KEY = 'arrakis:{community-events}:records';
export function eventsReply(operation, key, args) {
  if (operation.toUpperCase() === 'HGET' && key === KEY) return { value: records.get(args[0]) ?? null };
  if (operation.toUpperCase() !== 'EVAL' || args[1] !== KEY) return undefined;
  const values = args.slice(2);
  if (key.includes('community-events:initialize')) {
    if (!records.has('__seeded')) {
      const seed = JSON.parse(values[0]);
      records.set('__seeded', '1');
      records.set(seed.id, values[0]);
    }
    return { value: [...records].flat() };
  }
  if (key.includes('community-events:mutate')) {
    const [id, revision, payload, method, limit] = values;
    const old = records.get(id);
    if (Number(revision) === 0) {
      if (old) return { value: 'conflict' };
      if (records.size >= Number(limit) + 1) return { value: 'full' };
    } else {
      if (!old) return { value: 'missing' };
      if (JSON.parse(old).revision !== Number(revision)) return { value: 'conflict' };
    }
    if (method === 'delete') records.delete(id);
    else records.set(id, payload);
    return { value: 'ok' };
  }
  return undefined;
}
