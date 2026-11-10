// Browser fixture only; real Lua, capacity races and retention are verified by the Redis integration suite.
const guilds = new Map();
export function operationsReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- guild-operations-read'))
    return { value: [...(guilds.get(key) ?? new Map()).entries()].flat() };
  if (!script.includes('-- guild-operations-save')) return undefined;
  const records = guilds.get(key) ?? new Map();
  const old = records.get(args[2]);
  if ((old ? JSON.parse(old).revision : '') !== args[3]) return { value: 'conflict' };
  if (!old && records.size >= Number(args[6])) return { value: 'full' };
  if (args[5] === 'delete') records.delete(args[2]);
  else records.set(args[2], args[4]);
  guilds.set(key, records);
  return { value: 'ok' };
}
