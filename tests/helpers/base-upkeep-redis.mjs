// Browser-only upkeep model. Actual Lua, throttling, retention and races are covered on real standalone/Cluster Redis.
const records = new Map();
const samples = new Map();
export function baseUpkeepReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- base-upkeep-read')) return { value: records.get(key) ?? '' };
  if (script.includes('-- base-upkeep-save')) {
    const old = records.get(key);
    if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
    records.set(key, args[3]);
    return { value: 'ok' };
  }
  if (script.includes('-- base-water-append')) {
    const list = samples.get(key) ?? [];
    const last = list.at(-1);
    if (last && Number(args[2]) - JSON.parse(last).t < Number(args[4])) return { value: 'skip' };
    samples.set(key, [...list, args[3]].slice(-Number(args[5])));
    return { value: 'ok' };
  }
  if (script.includes('-- base-water-read')) return { value: samples.get(key) ?? [] };
  return undefined;
}
