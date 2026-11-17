// Disposable model only. Real standalone/Cluster tests verify multi-key Lua behavior.
export function createPrivacyFixture() {
  const records = new Map();
  return (operation, script, args) => {
    if (operation.toUpperCase() !== 'EVAL') return undefined;
    if (script.includes('-- privacy-owner-read-v1') || script.includes('-- privacy-link-read-v1'))
      return { value: records.get(args[0]) ?? '' };
    if (!script.includes('-- privacy-save-v1')) return undefined;
    const [owner, oldLink, newLink, revision, body, , , oldId, ownerHash] = args;
    const previous = records.get(owner);
    if (
      previous ? JSON.parse(previous).revision !== revision || JSON.parse(previous).shareId !== oldId : revision !== ''
    )
      return { value: 'conflict' };
    for (const key of [oldLink, newLink])
      if (records.has(key) && records.get(key) !== ownerHash) return { value: 'invalid' };
    records.set(owner, body);
    if (oldLink !== newLink) records.delete(oldLink);
    records.set(newLink, ownerHash);
    return { value: 'ok' };
  };
}
