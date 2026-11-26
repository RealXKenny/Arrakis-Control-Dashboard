// Browser-only model; real Redis integration verifies Lua, bounds, retention and concurrency.
const books = new Map();
export function projectsReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  const current = books.get(key) ?? { revision: '', book: '' };
  if (script.includes('-- guild-projects-read')) return { value: [current.revision, current.book] };
  if (!script.includes('-- guild-projects-save')) return undefined;
  if (current.revision !== args[2]) return { value: 'conflict' };
  books.set(key, { revision: args[3], book: args[4] });
  return { value: 'ok' };
}
