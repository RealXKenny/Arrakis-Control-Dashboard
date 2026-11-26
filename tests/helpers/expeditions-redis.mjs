// Browser-only expedition plan and rescue card model. Real Lua, TTLs and races are covered on real Redis.
const values = new Map();
export function expeditionsReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL' || typeof script !== 'string') return undefined;
  const count = Number(args[0]);
  const keys = args.slice(1, 1 + count);
  const argv = args.slice(1 + count);
  if (script.includes('-- expedition-plan-read') || script.includes('-- rescue-read'))
    return { value: values.get(keys[0]) ?? '' };
  if (script.includes('-- expedition-plan-save')) {
    const old = values.get(keys[0]);
    if ((old ? JSON.parse(old).revision : '') !== argv[0]) return { value: 'conflict' };
    values.set(keys[0], argv[1]);
    return { value: 'ok' };
  }
  if (script.includes('-- rescue-publish')) {
    const old = values.get(keys[0]);
    if ((old ? JSON.parse(old).tag : '') !== argv[0]) return { value: 'conflict' };
    if (keys[2] !== keys[1]) values.delete(keys[2]);
    values.set(keys[1], argv[1]);
    values.set(keys[0], argv[2]);
    return { value: 'ok' };
  }
  if (script.includes('-- rescue-cancel')) {
    const old = values.get(keys[0]);
    if (!old || JSON.parse(old).tag !== argv[0]) return { value: 'conflict' };
    values.delete(keys[1]);
    values.delete(keys[0]);
    return { value: 'ok' };
  }
  return undefined;
}
