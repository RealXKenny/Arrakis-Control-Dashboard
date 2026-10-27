import { useState } from 'react';
import { useMarketData } from '../hooks/useMarketData';
import { formatMarketNumber, getBuybackPercent, getSuggestedSellPrice } from '../utils/market';
import layout from '../market.module.css';
import ItemImage from './ItemImage';
import { itemImage } from '../utils/item-image';

const MARKET_PAGE_SIZE = 24;

export default function MarketBoard() {
  const [query, setQuery] = useState('');
  // Dev note: the market board has many listings but refuses to list its hobbies.
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('listed');
  const [owner, setOwner] = useState('all');
  const { data, loading, error, stale, refresh } = useMarketData(query, page, sort, owner);
  const items = Array.isArray(data?.items?.rows) ? data.items.rows : [];
  const total = Number(data?.items?.totalCount ?? items.length);
  const pages = Math.max(1, Math.ceil(total / MARKET_PAGE_SIZE));
  const buybackPercent = getBuybackPercent(data?.marketConfig);
  const suggestedSellPrice = (item) => getSuggestedSellPrice(item?.lowest_price ?? item?.lowestPrice, buybackPercent);
  const supported = data?.items?.capabilities?.exchange !== false;
  return (
    <section className={layout.board} aria-busy={loading}>
      {stale && data && <p role="status">Showing a cached market reading while refreshing.</p>}
      <div className={layout.header}>
        <div>
          <p className={layout.eyebrow}>Current sell orders</p>
        </div>
        <button type="button" onClick={refresh} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh Market'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-red-300">
          {error}{' '}
          <button type="button" onClick={refresh}>
            Try again
          </button>
        </p>
      )}
      {data?.warnings?.map((message) => (
        <p key={message} className={layout.notice}>
          {message}
        </p>
      ))}
      <div className={layout.summary} data-market-summary>
        <div>
          <span>Total listings</span>
          <strong>{formatMarketNumber(data?.stats?.totalListings)}</strong>
        </div>
        <div>
          <span>Matching items</span>
          <strong>{formatMarketNumber(data?.matchingItems)}</strong>
        </div>
        <div>
          <span>Buyback rate</span>
          <strong>{buybackPercent == null ? '—' : `${buybackPercent}%`}</strong>
        </div>
      </div>
      <p className={layout.notice}>
        Compare asking prices, available stock, and suggested sell values across current listings.
      </p>
      <div className={layout.workspace} data-market-workspace>
        <div>
          <label className={layout.search}>
            Search the market
            <input
              value={query}
              maxLength={128}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
              }}
              placeholder="Search all items, categories, or template IDs"
            />
          </label>
          <div className={layout.filters}>
            <div role="group" aria-label="Listing owner">
              {[
                ['all', 'All'],
                ['player', 'My listings'],
                ['bot', 'Bot'],
              ].map(([value, name]) => (
                <button
                  key={value}
                  aria-pressed={owner === value}
                  onClick={() => {
                    setOwner(value);
                    setPage(0);
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <label>
              Sort{' '}
              <select
                aria-label="Sort listings"
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value);
                  setPage(0);
                }}
              >
                <option value="listed">Most listed</option>
                <option value="price">Lowest price</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>
          <div className={layout.tableViewport}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Grade</th>
                  <th>Listings</th>
                  <th>Units</th>
                  <th>Lowest ask</th>
                  <th>Suggested sell</th>
                </tr>
              </thead>
              <tbody>
                {/* Dev note: every row has a price, but none will split the bill. */}
                {items.map((item, index) => (
                  <tr key={`${item.template_id ?? item.templateId}-${item.quality_level ?? item.quality ?? index}`}>
                    <td>
                      <span className={layout.itemButton}>
                        <ItemImage src={itemImage(item)} /> {item.display_name ?? item.name ?? item.template_id}
                      </span>
                    </td>
                    <td>{formatMarketNumber(item.quality_level ?? item.quality)}</td>
                    <td>{formatMarketNumber(item.listing_count ?? item.listings)}</td>
                    <td>{formatMarketNumber(item.total_stock ?? item.stock)}</td>
                    <td>{formatMarketNumber(item.lowest_price ?? item.lowestPrice)}</td>
                    <td>{formatMarketNumber(suggestedSellPrice(item))}</td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={6} className={layout.empty}>
                      {loading
                        ? 'Loading market…'
                        : error
                          ? 'Market data could not be loaded.'
                          : data?.availabilityMessage
                            ? data.availabilityMessage
                            : !supported
                              ? 'Exchange data is unavailable on this server.'
                              : 'No matching listings found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className={layout.pagination}>
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}>
          Previous
        </button>
        <span aria-live="polite">
          Page {page + 1} of {pages}
          {error && data ? ' · showing last loaded data' : ''}
        </span>
        <button
          type="button"
          disabled={page + 1 >= pages || loading || Boolean(error)}
          onClick={() => setPage((value) => value + 1)}
        >
          Next
        </button>
      </div>
    </section>
  );
}
