// Browser-only model. Real Redis tests verify Lua, deadlines, quotas and races.
const guilds = new Map();
export function pollsReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- guild-polls-read')) return { value: [...(guilds.get(key) ?? new Map()).entries()].flat() };
  if (!script.includes('-- guild-polls-save')) return undefined;
  const records = guilds.get(key) ?? new Map();
  const old = records.get(args[2]);
  if ((old ? JSON.parse(old).revision : '') !== args[3]) return { value: 'conflict' };
  if (!old && records.size >= Number(args[6])) return { value: 'full' };
  if (['create', 'vote', 'withdraw'].includes(args[5]) && Date.now() >= Number(args[8])) return { value: 'closed' };
  if (args[5] === 'delete') records.delete(args[2]);
  else records.set(args[2], args[4]);
  guilds.set(key, records);
  return { value: 'ok' };
}
