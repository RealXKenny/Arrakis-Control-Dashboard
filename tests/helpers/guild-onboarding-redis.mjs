// Browser-only model; real Redis integration verifies Lua, bounds, retention and concurrency.
const books = new Map();
export function onboardingReply(operation, script, args) {
  if (operation.toUpperCase() !== 'EVAL') return undefined;
  const key = args[1];
  if (script.includes('-- guild-onboarding-read')) return { value: books.get(key) ?? '' };
  if (!script.includes('-- guild-onboarding-save')) return undefined;
  const old = books.get(key);
  if ((old ? JSON.parse(old).revision : '') !== args[2]) return { value: 'conflict' };
  books.set(key, args[3]);
  return { value: 'ok' };
}
