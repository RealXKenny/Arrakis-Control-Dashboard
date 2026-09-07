import '../../../lib/assert-server';
import { getLinkedPlayer } from '../../player/server/linked-player';
import { getDuneClient } from '../../../infrastructure/dune';
import type { DashboardSession } from '../../../lib/session-store';
import { AppError } from '../../../lib/errors';
import { record, rows, type DataRow } from '../utils/inventory';

async function playerOwnerIds(session: DashboardSession) {
  const player = await getLinkedPlayer({
    guildId: session.guildId,
    channelId: 'dashboard',
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds,
    interactionId: `market-${Date.now()}`,
    commandName: 'portal',
  });
  if (!player?.linked) throw new AppError('Link your character to view your listings.', 403, 'PLAYER_NOT_LINKED', true);
  const ids = new Set(
    [player.pawnId, player.controllerId]
      .filter((id) => typeof id === 'string' || (typeof id === 'number' && Number.isSafeInteger(id)))
      .map(String),
  );
  if (!ids.size) throw new AppError('Your character ownership could not be verified.', 503, 'OWNER_UNAVAILABLE', true);
  return ids;
}

export async function ownedListings(
  session: DashboardSession,
  templateId: string,
  quality: string,
  verifiedIds?: Set<string>,
) {
  const params = new URLSearchParams({ templateId, owner: 'player' });
  if (quality) params.set('quality', quality);
  const response = await getDuneClient().request('GET', `/api/exchange/listings?${params}`);
  const listings = rows(response);
  if (!listings) throw new AppError('Listing data is unavailable.', 502, 'INVALID_LISTINGS', true);
  // Check provider capability before asking the adapter for a character identity.
  // Display names alone cannot establish ownership.
  filterOwnedListings(listings, new Set());
  if (!listings.length) return [];
  const ids = verifiedIds ?? (await playerOwnerIds(session));
  return filterOwnedListings(listings, ids);
}

export function filterOwnedListings(listings: DataRow[], ids: Set<string>): DataRow[] {
  if (
    listings.some(
      (item) =>
        typeof item.owner_id !== 'string' &&
        !(typeof item.owner_id === 'number' && Number.isSafeInteger(item.owner_id)),
    )
  ) {
    throw new AppError(
      'My listings is unavailable: the Console does not provide verified seller IDs. Other players’ listings are not shown here.',
      503,
      'SELLER_ID_UNAVAILABLE',
      true,
    );
  }
  return listings.filter((item) => ids.has(String(item.owner_id)) && item.owner_type !== 'bot');
}

export async function ownMarketItems(session: DashboardSession, query: URLSearchParams) {
  // No Console owner-ID filter exists: inspect a bounded complete item set and fail
  // explicitly if it is too large, rather than silently showing partial ownership.
  const search = new URLSearchParams(query);
  search.set('page', '0');
  search.set('pageSize', '100');
  search.set('owner', 'player');
  const data = record(await getDuneClient().request('GET', `/api/exchange/items?${search}`));
  const items = rows(data);
  if (!items) throw new AppError('Market data is unavailable.', 502, 'INVALID_MARKET', true);
  if (Number(data.totalCount ?? items.length) > 100)
    throw new AppError(
      'Narrow your search to inspect your listings; this Console requires per-item ownership checks.',
      422,
      'NARROW_SEARCH',
      true,
    );
  const selected: DataRow[] = [];
  const deadline = Date.now() + 20000;
  for (const item of items) {
    if (Date.now() > deadline)
      throw new AppError('Ownership lookup timed out. Narrow your search and retry.', 503, 'OWNERSHIP_TIMEOUT', true);
    const own = await ownedListings(session, String(item.template_id ?? ''), String(item.quality_level ?? ''));
    if (!own.length) continue;
    const prices = own.map((entry) => String(entry.price ?? entry.item_price ?? ''));
    const stocks = own.map((entry) => String(entry.stock ?? ''));
    if (!prices.every((value) => /^\d+$/.test(value)) || !stocks.every((value) => /^\d+$/.test(value)))
      throw new AppError('Your listing totals could not be verified.', 502, 'INVALID_LISTING', true);
    selected.push({
      ...item,
      listing_count: own.length,
      total_stock: stocks.reduce((sum, value) => sum + BigInt(value), 0n).toString(),
      lowest_price: prices.reduce((min, value) => (BigInt(value) < BigInt(min) ? value : min)),
    });
  }
  const sort = query.get('sortColumn');
  selected.sort((a, b) => {
    if (sort === 'listing_count') return Number(b.listing_count) - Number(a.listing_count);
    if (sort === 'lowest_price') {
      const left = BigInt(String(a.lowest_price));
      const right = BigInt(String(b.lowest_price));
      return left < right ? -1 : left > right ? 1 : 0;
    }
    return String(a.display_name ?? a.template_id).localeCompare(String(b.display_name ?? b.template_id));
  });
  return { ...data, rows: selected, totalCount: selected.length };
}
