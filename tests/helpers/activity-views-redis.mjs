// Browser-only CAS model. Standalone/Cluster integration tests execute the real Lua.
export function createActivityViewsFixture() {
  const records = new Map();
  return (operation, script, args) => {
    if (operation.toUpperCase() !== 'EVAL') return undefined;
    const key = args[1];
    if (script.includes('-- activity-views-read-v1')) return { value: records.get(key) ?? '' };
    if (!script.includes('-- activity-views-save-v1')) return undefined;
    const old = records.get(key);
    if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
    records.set(key, args[3]);
    return { value: 'ok' };
  };
}
