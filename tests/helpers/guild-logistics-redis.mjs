// Browser fixture only; real Lua compare-and-set and retention are verified by the Redis integration suite.
const documents = new Map();
export function logisticsReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- guild-logistics-read')) return { value: documents.get(key) ?? null };
  if (!script.includes('-- guild-logistics-save')) return undefined;
  const old = documents.get(key);
  if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
  if (args[3] === '') documents.delete(key);
  else documents.set(key, args[3]);
  return { value: 'ok' };
}
