// Browser-only model. The integration suite verifies the actual Lua, quotas and reservation races on Redis.
const guilds = new Map();
export function resourcesReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- guild-resources-read'))
    return { value: [...(guilds.get(key) ?? new Map()).entries()].flat() };
  if (!script.includes('-- guild-resources-save')) return undefined;
  const records = guilds.get(key) ?? new Map();
  const old = records.get(args[2]);
  if ((old ? JSON.parse(old).revision : '') !== args[3]) return { value: 'conflict' };
  if (!old) {
    if (records.size >= Number(args[6])) return { value: 'full' };
    const open = [...records.values()]
      .map((value) => JSON.parse(value))
      .filter((request) => request.requesterId === args[8] && request.status === 'open').length;
    if (open >= Number(args[9])) return { value: 'member-full' };
  }
  if (args[5] === 'delete') records.delete(args[2]);
  else records.set(args[2], args[4]);
  guilds.set(key, records);
  return { value: 'ok' };
}
