import '../../../lib/assert-server';
import { getDuneClient } from '../../../server/integrations/dune';
import { ReadCache } from '../../../lib/cache/read-cache';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import type { DashboardSession } from '../../auth/server/session-store';
import { MARKET_PAGE_SIZE, normalizeMarketPage, type MarketPage, type MarketQuery } from '../normalize';
import { itemImage } from '../../player/item-image';
import { ownMarketItems } from './my-listings';
import { spendReadBudget } from '../../../server/read-budget';

export type MarketResult =
  | { status: 'ok'; data: MarketPage }
  | { status: 'limited'; retryAfter: number }
  | { status: 'unavailable'; message: string };

const SORTS: Record<MarketQuery['sort'], [column: string, direction: 'asc' | 'desc']> = {
  listed: ['listing_count', 'desc'],
  price: ['lowest_price', 'asc'],
  name: ['display_name', 'asc'],
};

// Shared listings are identical for every viewer, so one short-lived cache absorbs bursts of 100
// concurrent readers into a single upstream call per distinct query.
const sharedPages = new ReadCache<MarketPage | null>(
  (value) => JSON.stringify(value).length,
  (value) => value !== null,
  { ttlMs: 15_000, maxEntries: 200 },
);

function upstreamQuery(query: MarketQuery, owner: 'all' | 'player'): URLSearchParams {
  const [sortColumn, sortDirection] = SORTS[query.sort];
  return new URLSearchParams({
    page: String(query.page - 1),
    pageSize: String(MARKET_PAGE_SIZE),
    q: query.q,
    owner,
    sortColumn,
    sortDirection,
  });
}

export async function loadMarket(query: MarketQuery, session: DashboardSession): Promise<MarketResult> {
  const budget = await spendReadBudget();
  if (!budget.allowed) return { status: 'limited', retryAfter: budget.retryAfter };

  try {
    let page: MarketPage | null;
    if (query.owner === 'mine') {
      // Personal listings depend on who is asking, so they bypass the shared cache.
      const raw = await ownMarketItems(session, upstreamQuery(query, 'player'));
      page = normalizeMarketPage(raw, query, itemImage);
    } else {
      const key = `market:${query.sort}:${query.page}:${query.q.toLowerCase()}`;
      const entry = await sharedPages.get(key, async () => {
        const raw = await getDuneClient().request('GET', `/api/exchange/items?${upstreamQuery(query, 'all')}`);
        return normalizeMarketPage(raw, query, itemImage);
      });
      page = entry.data;
    }
    if (!page) return { status: 'unavailable', message: 'The market returned data we could not read.' };
    return { status: 'ok', data: page };
  } catch (error) {
    if (error instanceof AppError && error.expose) return { status: 'unavailable', message: error.message };
    logger.error('Unable to load market', error);
    return { status: 'unavailable', message: 'The market is unreachable right now. Try again shortly.' };
  }
}
