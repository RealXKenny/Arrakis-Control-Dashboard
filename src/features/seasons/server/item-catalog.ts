import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getServerEnv } from '../../../config/env';
import { getDuneClient } from '../../../server/integrations/dune';
import { readShared, type CachePolicy } from '../../../lib/cache/shared-cache';
import type { CatalogItem } from '../engine/economy';

const rowSchema = z.object({
  id: z.string().min(1).max(240),
  name: z.string().max(300).optional(),
  category: z.string().max(120).optional(),
  source: z.string().max(120).optional(),
  stackSize: z.number().int().min(1).max(1000000).optional(),
  entitlementControlled: z.boolean().optional(),
  requiredDlc: z.string().max(200).optional(),
});
const MAX_ROWS = 10000;
// Static game metadata: one shared reading refreshed twice a day, kept for a week as the last known good copy.
const catalogPolicy: CachePolicy<CatalogItem[]> = {
  name: 'item-catalog',
  version: 1,
  freshMs: 12 * 3_600_000,
  retainMs: 7 * 86_400_000,
  maxBytes: 6 * 1024 * 1024,
  lockMs: 60_000,
  validate: (raw) => {
    const items = Array.isArray(raw) ? normalizeCatalog({ rows: raw }) : normalizeCatalog(raw);
    // An empty catalog is never a usable reward source; keep the previous one instead.
    return items.length ? items : undefined;
  },
};
export const catalogHash = (items: ReadonlyArray<CatalogItem>) =>
  createHash('sha256')
    .update(
      [...items]
        .map((i) => `${i.id}|${i.category}`)
        .sort()
        .join('\n'),
    )
    .digest('hex');
export function normalizeCatalog(payload: unknown): CatalogItem[] {
  const rows = (payload as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new Error('Invalid item catalog response.');
  const out: CatalogItem[] = [];
  for (const raw of rows) {
    const parsed = rowSchema.safeParse(raw);
    if (!parsed.success) continue;
    const row = parsed.data;
    out.push({
      id: row.id,
      name: row.name ?? row.id,
      category: row.category ?? 'unknown',
      source: row.source,
      stackSize: row.stackSize,
      entitlementControlled: row.entitlementControlled,
      requiredDlc: row.requiredDlc,
    });
  }
  return out;
}
/** Reads the Console's own item catalog (never a copy). Returns undefined when the Console is not configured. */
export async function loadItemCatalog(): Promise<{ items: CatalogItem[]; hash: string } | null | undefined> {
  const env = getServerEnv();
  if (!env.DUNE_API_URL || !env.DUNE_API_KEY) return undefined;
  try {
    const reading = await readShared(catalogPolicy, [env.DUNE_API_URL], () =>
      getDuneClient().request('GET', '/api/admin/items/catalog', {
        query: { limit: MAX_ROWS },
        timeoutMs: 15000,
        retryRead: true,
      }),
    );
    return { items: reading.data, hash: catalogHash(reading.data) };
  } catch {
    return null;
  }
}
