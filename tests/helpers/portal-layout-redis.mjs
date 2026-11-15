// Disposable preference model for browser fixtures. Integration tests exercise the real Redis scripts.
export function createPortalLayoutFixture() {
  const records = new Map();
  return (operation, script, args) => {
    if (operation.toUpperCase() !== 'EVAL') return undefined;
    const key = args[1];
    if (script.includes('-- portal-layout-read-v1')) return { value: records.get(key) ?? '' };
    if (!script.includes('-- portal-layout-save-v1')) return undefined;
    const old = records.get(key);
    if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
    records.set(key, args[3]);
    return { value: 'ok' };
  };
}
