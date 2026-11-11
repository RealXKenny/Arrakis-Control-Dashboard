// Browser-only preference model. Actual Lua, retention and races are covered on real standalone/Cluster Redis.
const records = new Map();
export function itemPinsReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- item-pins-read')) return { value: records.get(key) ?? '' };
  if (!script.includes('-- item-pins-save')) return undefined;
  const old = records.get(key);
  if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
  records.set(key, args[3]);
  return { value: 'ok' };
}
