// Isolated browser fixture only. Production executes the Lua scripts against Redis.
const cases = new Map();
const values = (map) => [...map].flat();

export function resetModeration() {
  cases.clear();
}

export function moderationReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL' || args[1] !== 'arrakis:{moderation}:cases') return undefined;
  if (script.includes('moderation-cases-read')) return { value: values(cases) };
  if (script.includes('moderation-case-create')) {
    const [id, payload, limit] = args.slice(2);
    if (cases.size >= Number(limit)) return { value: 'full' };
    cases.set(id, payload);
    return { value: 'ok' };
  }
  if (!script.includes('moderation-case-mutate')) return undefined;
  const [id, expected, payload, action] = args.slice(2);
  const old = cases.get(id) ? JSON.parse(cases.get(id)) : null;
  if ((old?.revision ?? '') !== expected) return { value: 'conflict' };
  const required = { assign: 'open', unassign: 'assigned', decide: 'assigned', close: 'resolved' }[action];
  if (old && old.status !== required) return { value: 'closed' };
  cases.set(id, payload);
  return { value: 'ok' };
}
