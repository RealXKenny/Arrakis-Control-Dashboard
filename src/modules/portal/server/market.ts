import '../../../lib/assert-server';
import { record } from '../utils/inventory';
import { NextResponse } from '../../../infrastructure/pages-api';
import { cookies } from '../../../infrastructure/cookies';
import { getDuneClient } from '../../../infrastructure/dune';
import { getSession } from '../../../lib/session-store';
import { AppError } from '../../../lib/errors';
import { logger } from '../../../lib/logger';
import { ownMarketItems } from './my-listings';

export async function GET(req, res) {
  try {
    const sessionId = cookies(req, res).get('dashboard_session')?.value;
    const session = sessionId ? await getSession(sessionId) : null;
    if (!sessionId || !session || session.expiresAt < Date.now()) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URL(req.url, 'http://localhost').searchParams;
    const page = params.get('page') ?? '0';
    const q = (params.get('q') ?? '').trim();
    const sort = params.get('sort') ?? 'name';
    const owner = params.get('owner') ?? 'all';
    const sorts: Record<string, [string, string]> = {
      name: ['display_name', 'asc'],
      listed: ['listing_count', 'desc'],
      price: ['lowest_price', 'asc'],
    };
    if (!Object.hasOwn(sorts, sort) || !['all', 'player', 'bot'].includes(owner))
      throw new AppError('Invalid market filter', 400, 'INVALID_MARKET_QUERY', true);
    if (!/^\d{1,6}$/.test(page) || q.length > 128)
      throw new AppError('Invalid market search or page', 400, 'INVALID_MARKET_QUERY', true);
    const query = new URLSearchParams({
      page,
      pageSize: '100',
      q,
      owner,
      sortColumn: sorts[sort][0],
      sortDirection: sorts[sort][1],
    });
    const client = getDuneClient();
    const globalQuery = new URLSearchParams(query);
    globalQuery.set('owner', 'all');
    const globalItems = client.request('GET', `/api/exchange/items?${globalQuery}`);
    const [itemsResult, statsResult, marketResult, globalResult] = await Promise.allSettled([
      owner === 'player'
        ? ownMarketItems(session, query)
        : owner === 'all'
          ? globalItems
          : client.request('GET', `/api/exchange/items?${query}`),
      client.request('GET', '/api/exchange/stats'),
      client.request('GET', '/api/exchange/market'),
      globalItems,
    ]);
    const personalUnavailable =
      itemsResult.status === 'rejected' &&
      itemsResult.reason instanceof AppError &&
      itemsResult.reason.code === 'SELLER_ID_UNAVAILABLE';
    if (itemsResult.status === 'rejected' && !personalUnavailable) throw itemsResult.reason;
    const items =
      itemsResult.status === 'fulfilled'
        ? itemsResult.value
        : { rows: [], totalCount: null, capabilities: { exchange: true, personalListings: false } };
    const stats = statsResult.status === 'fulfilled' ? statsResult.value : null;
    const matchingItems = globalResult.status === 'fulfilled' ? (record(globalResult.value).totalCount ?? null) : null;
    const marketConfig = marketResult.status === 'fulfilled' ? marketResult.value : null;
    const warnings = [];
    if (globalResult.status === 'rejected') warnings.push('Global matching item count is temporarily unavailable.');
    if (statsResult.status === 'rejected') warnings.push('Market totals are temporarily unavailable.');
    if (marketResult.status === 'rejected')
      warnings.push('Buyback configuration is unavailable; listings are still shown.');

    const payload = {
      stats,
      items,
      matchingItems,
      marketConfig,
      warnings,
      availabilityMessage: personalUnavailable ? 'No listings found.' : undefined,
    };
    return NextResponse.json({ ok: true, ...payload }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Unable to load market', error);
    return NextResponse.json({ ok: false, error: 'Unable to load market data' }, { status: 502 });
  }
}
