/**
 * Old -> new Redis key names for the cluster re-key (see keys.ts), plus the migration runner.
 * Plain ESM so both the CLI (`npm run redis:rekey`) and the unit tests can import it.
 */

const G = 'arrakis:{guilds}:';
const BM = 'arrakis:{bm}:';

/** Ordered rules: the first match wins. Exact matches come before the prefixes that contain them. */
const RULES = [
  { exact: 'arrakis:guild-requirements', to: `${G}requirements-index` },
  { exact: 'arrakis:guild-support-unread', to: `${G}support-unread` },
  { exact: 'arrakis:base-marketplace:listings', to: `${BM}v1:listings` },
  { prefix: 'arrakis:guild-applications-index:', to: `${G}applications-index:` },
  { prefix: 'arrakis:guild-applications:', to: `${G}applications:` },
  { prefix: 'arrakis:guild-requirements:', to: `${G}requirements:` },
  { prefix: 'arrakis:guild-logo:', to: `${G}logo:` },
  { prefix: 'arrakis:guild-support:', to: `${G}support:` },
  { prefix: 'arrakis:guild-application-review:', to: `${G}application-review:` },
  // Covers the conversation and its `:seen` companion.
  { prefix: 'arrakis:guild-chat:', to: `${G}chat:` },
  { prefix: 'arrakis:base-preview:', to: `${BM}preview:` },
  { prefix: 'arrakis:base-marketplace:listing:', to: `${BM}v1:listing:` },
  { prefix: 'arrakis:base-marketplace:summary-state:', to: `${BM}v1:summary-state:` },
];

const SOLIDO_OPERATION = /^arrakis:solido:operation:([^:{}]+):(.+)$/;
const SOLIDO_HISTORY = /^arrakis:solido:([^:{}]+):(\d{4}-\d{2}-\d{2})$/;

/** New name for a legacy key, or null when the key needs no migration. */
export function rekeyName(key) {
  for (const rule of RULES) {
    if (rule.exact !== undefined && key === rule.exact) return rule.to;
    if (rule.prefix !== undefined && key.startsWith(rule.prefix)) return rule.to + key.slice(rule.prefix.length);
  }
  const operation = SOLIDO_OPERATION.exec(key);
  if (operation) return `arrakis:{solido:${operation[1]}}:operation:${operation[2]}`;
  const history = SOLIDO_HISTORY.exec(key);
  if (history) return `arrakis:{solido:${history[1]}}:history:${history[2]}`;
  return null;
}

/**
 * Rename every legacy key on a single Redis node. `redis` is an ioredis-compatible client.
 *
 * RENAMENX is atomic, preserves TTLs, and never overwrites: if the new key already exists (the new
 * code wrote there first) the old key is left alone and reported as a conflict for a human to judge.
 * Re-running is safe; migrated keys no longer match any rule.
 */
export async function runRekey(redis, { apply = false, onProgress } = {}) {
  const report = { scanned: 0, planned: 0, renamed: 0, vanished: 0, conflicts: [] };
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', 'arrakis:*', 'COUNT', 500);
    cursor = next;
    for (const key of keys) {
      report.scanned++;
      const target = rekeyName(key);
      if (!target) continue;
      report.planned++;
      if (!apply) continue;
      try {
        if ((await redis.renamenx(key, target)) === 1) report.renamed++;
        else report.conflicts.push(key);
      } catch (error) {
        // SCAN can return a key twice, or it can expire between scan and rename.
        if (/no such key/i.test(String(error?.message))) report.vanished++;
        else throw error;
      }
    }
    onProgress?.(report);
  } while (cursor !== '0');
  return report;
}
