// Browser-only model of the single-key scripts; the integration suite runs the real Lua against Redis.
const boards = new Map();
export function noticeboardReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- guild-noticeboard-read')) return { value: boards.get(key) ?? '' };
  if (!script.includes('-- guild-noticeboard-save')) return undefined;
  const old = boards.get(key);
  if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
  boards.set(key, args[3]);
  return { value: 'ok' };
}
