// Browser-only market planner model. Actual Lua, retention, caps and races are covered on real standalone/Cluster Redis.
const values = new Map();
const lists = new Map();
export function marketPlannerReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL' || typeof script !== 'string' || !script.includes('-- market-'))
    return undefined;
  const key = args[1];
  const argv = args.slice(2);
  if (script.includes('-- market-planner-read')) return { value: values.get(key) ?? '' };
  if (script.includes('-- market-planner-save')) {
    const old = values.get(key);
    if ((old ? JSON.parse(old).revision : '') !== argv[0]) return { value: 'conflict' };
    values.set(key, argv[1]);
    return { value: 'ok' };
  }
  if (script.includes('-- market-alerts-write')) {
    values.set(key, argv[0]);
    return { value: 'ok' };
  }
  if (script.includes('-- market-search-push')) {
    const list = (lists.get(key) ?? []).filter((entry) => entry !== argv[0]);
    lists.set(key, [argv[0], ...list].slice(0, Number(argv[1])));
    return { value: 'ok' };
  }
  if (script.includes('-- market-list-read')) return { value: (lists.get(key) ?? []).slice(0, Number(argv[0])) };
  if (script.includes('-- market-list-clear')) {
    lists.delete(key);
    return { value: 'ok' };
  }
  if (script.includes('-- market-price-push')) {
    const list = lists.get(key) ?? [];
    const last = list[0] ? JSON.parse(list[0]) : null;
    if (last && Number(argv[1]) - last.t < Number(argv[2])) return { value: 'skip' };
    lists.set(key, [argv[0], ...list].slice(0, Number(argv[3])));
    return { value: 'ok' };
  }
  return undefined;
}
