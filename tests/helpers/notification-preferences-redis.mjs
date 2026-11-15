// Disposable CAS model; the integration suite checks real Lua behavior.
export function createNotificationPreferencesFixture() {
  const records = new Map();
  return (operation, script, args) => {
    if (operation.toUpperCase() !== 'EVAL') return undefined;
    const key = args[1];
    if (script.includes('-- notification-preferences-read-v1')) return { value: records.get(key) ?? '' };
    if (!script.includes('-- notification-preferences-save-v1')) return undefined;
    const old = records.get(key);
    if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
    records.set(key, args[3]);
    return { value: 'ok' };
  };
}
