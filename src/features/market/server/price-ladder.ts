import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { ReadCache } from '../../../lib/cache/read-cache';
import { logger } from '../../../lib/logger';
import { rows } from '../../player/inventory';
import { classifyParty, ladderKeyFor, summarizeLadder, type Order } from '../planner';
import { recordPricePoint } from './planner-store';

/** Sell orders read per ladder. Larger ladders are reported as truncated rather than summarized as complete. */
export const LADDER_ORDER_LIMIT = 500;

export type Ladder =
  | { status: 'ok'; orders: Order[]; rejected: number; truncated: boolean; readAt: string }
  | { status: 'unavailable'; message: string; readAt: string };

const WHOLE = /^(0|[1-9][0-9]{0,29})$/;
function whole(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && WHOLE.test(value.trim()) ? value.trim() : null;
}

/** Keeps only price, stock and classification. Seller IDs and names never leave this function. */
export function normalizeLadder(raw: unknown, readAt: string): Ladder {
  const list = rows(raw);
  if (!list) return { status: 'unavailable', message: 'The exchange returned listings we could not read.', readAt };
  const orders: Order[] = [];
  let rejected = 0;
  for (const row of list.slice(0, LADDER_ORDER_LIMIT)) {
    const price = whole(row.price ?? row.item_price ?? row.unit_price);
    const stock = whole(row.stock ?? row.quantity);
    if (price === null || stock === null || stock === '0') {
      rejected += 1;
      continue;
    }
    orders.push({ price, stock, party: classifyParty(row.owner_type ?? row.ownerType) });
  }
  return { status: 'ok', orders, rejected, truncated: list.length > LADDER_ORDER_LIMIT, readAt };
}

// Ladders are identical for every viewer, so a short shared cache absorbs bursts of planner refreshes.
const ladders = new ReadCache<Ladder>(
  (value) => JSON.stringify(value).length,
  (value) => value.status === 'ok',
  { ttlMs: 15_000, maxEntries: 400 },
);

export const ladderKey = ladderKeyFor;

/**
 * Reads one item/grade ladder. Fresh successful reads also become a bounded observed-price snapshot (N043); a
 * failed snapshot write never hides the reading, and empty ladders are not recorded so unknown template IDs
 * cannot create series.
 */
export async function readLadder(
  templateId: string,
  grade: number | null | undefined,
  signal?: AbortSignal,
): Promise<Ladder> {
  try {
    const entry = await ladders.get(ladderKey(templateId, grade), async () => {
      const params = new URLSearchParams({ templateId, owner: 'all' });
      if (grade !== null && grade !== undefined) params.set('quality', String(grade));
      const readAt = new Date().toISOString();
      const ladder = normalizeLadder(
        await getDuneClient().request('GET', `/api/exchange/listings?${params}`, { timeoutMs: 8_000, signal }),
        readAt,
      );
      if (ladder.status === 'ok' && ladder.orders.length && !ladder.truncated) {
        const summary = summarizeLadder(ladder.orders);
        await recordPricePoint(templateId, grade ?? null, {
          at: readAt,
          lowest: summary.lowest,
          stock: summary.stock,
          orders: summary.orders,
        });
      }
      return ladder;
    });
    return entry.data;
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn('Market ladder read failed', { error: error instanceof Error ? error.name : 'unknown' });
    return {
      status: 'unavailable',
      message: 'This item’s listings are unavailable right now.',
      readAt: new Date().toISOString(),
    };
  }
}

/** Bounded fan-out: at most three ladder reads in flight per request. */
export async function readLadders<T extends { templateId: string; grade?: number | null }>(
  entries: T[],
  signal?: AbortSignal,
): Promise<Map<string, Ladder>> {
  const result = new Map<string, Ladder>();
  const queue = [...new Map(entries.map((entry) => [ladderKey(entry.templateId, entry.grade), entry])).values()];
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      signal?.throwIfAborted();
      result.set(ladderKey(entry.templateId, entry.grade), await readLadder(entry.templateId, entry.grade, signal));
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return result;
}
