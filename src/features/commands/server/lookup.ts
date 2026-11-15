import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { spendReadBudget } from '../../../server/read-budget';
import { AppError } from '../../../lib/errors';
import { record } from '../../../lib/value';
import { resolveItemCharacter } from '../../player/server/item-finder';
import type { DashboardSession } from '../../auth/server/session-store';
import { assetQuerySchema, assetLookupSchema, type AssetLookup } from '../model';

const safeId = (value: unknown) => {
  const text =
    typeof value === 'string' ? value : typeof value === 'number' && Number.isSafeInteger(value) ? String(value) : '';
  return /^[1-9][0-9]{0,15}$/.test(text) && Number.isSafeInteger(Number(text)) ? text : null;
};
function supported(raw: unknown) {
  const data = record(raw);
  if (data.supported === false || data.ok === false || data.found === false) throw new Error('Unavailable source');
  return data;
}
export async function lookupAssets(session: DashboardSession, rawQuery: string, callerSignal: AbortSignal) {
  const query = assetQuerySchema.safeParse(rawQuery);
  if (!query.success) throw new AppError('Enter 1–80 search characters.', 400, 'INVALID_QUERY', true);
  if (!(await spendReadBudget()).allowed) throw new AppError('Search capacity reached.', 429, 'RATE_LIMITED', true);
  const signal = AbortSignal.any([callerSignal, AbortSignal.timeout(12000)]);
  const character = await resolveItemCharacter(session);
  const result: AssetLookup = { assets: [], partial: false, checkedAt: new Date().toISOString() };
  const client = getDuneClient();
  const read = (path: string) => {
    signal.throwIfAborted();
    return client.request('GET', path, { timeoutMs: 4000, retryRead: false, signal });
  };
  for (const kind of ['bases', 'vehicles'] as const) {
    try {
      const source = supported(await read(`/api/players/${character.player}/${kind}`));
      if (!Array.isArray(source.rows)) throw new Error('Unavailable list');
      if (source.rows.length > 20 || Number(source.totalCount) > source.rows.length) result.partial = true;
      const seen = new Set<string>();
      const candidates = source.rows.slice(0, 20).flatMap((raw) => {
        const asset = record(raw);
        const id = safeId(asset.id ?? asset.base_id ?? asset.vehicle_id);
        if (!id) {
          result.partial = true;
          return [];
        }
        if (seen.has(id)) return [];
        seen.add(id);
        const name = typeof asset.name === 'string' ? asset.name.trim().slice(0, 120) : '';
        if (!name) {
          result.partial = true;
          return [];
        }
        return name.toLowerCase().includes(query.data.toLowerCase()) || id === query.data ? [{ id, name }] : [];
      });
      let index = 0;
      await Promise.all(
        Array.from({ length: Math.min(3, candidates.length) }, async () => {
          while (index < candidates.length && !signal.aborted) {
            const asset = candidates[index++];
            try {
              const permission = supported(await read(`/api/${kind}/${asset.id}/permissions`));
              if (
                permission.claimed === false ||
                !Array.isArray(permission.entries) ||
                permission.entries.length > 5000
              ) {
                result.partial = true;
                continue;
              }
              const own = permission.entries
                .map(record)
                .find((r) => r.playerId === character.controller && r.canonical === true);
              if (!own || ![1, 2, 3].includes(Number(own.rank))) {
                result.partial = true;
                continue;
              }
              const access = Number(own.rank) === 1 ? 'owned' : 'shared';
              result.assets.push({
                ...asset,
                kind: kind === 'bases' ? 'base' : 'vehicle',
                access,
                href:
                  kind === 'bases'
                    ? `/holdings?view=${access}#base-${asset.id}`
                    : `/vehicles?view=${access}#vehicle-${asset.id}`,
              });
            } catch {
              result.partial = true;
            }
          }
        }),
      );
    } catch {
      result.partial = true;
    }
  }
  if (signal.aborted) throw new AppError('Asset lookup was cancelled or timed out.', 504, 'LOOKUP_TIMEOUT', true);
  const current = await resolveItemCharacter(session);
  if (character.player !== current.player || character.controller !== current.controller)
    throw new AppError('Your character link changed. Search again.', 409, 'CHARACTER_CHANGED', true);
  signal.throwIfAborted();
  result.assets.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  result.checkedAt = new Date().toISOString();
  return assetLookupSchema.parse(result);
}
