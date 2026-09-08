import { useState } from 'react';
import { COLORS } from '../config/colors';
import { useMarketData } from '../hooks/useMarketData';
import { formatMarketNumber, getBuybackPercent } from '../utils/market';
import layout from '../market.module.css';
import dossier from '../dossier.module.css';
import PriceLadder from './PriceLadder';
import ItemImage from './ItemImage';
import { itemImage } from '../utils/item-image';

export default function MarketBoard() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState('listed');
  const [owner, setOwner] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, loading, error, stale, refresh } = useMarketData(query, page, sort, owner);
  const items = Array.isArray(data?.items?.rows) ? data.items.rows : [];
  const total = Number(data?.items?.totalCount ?? items.length);
  const pages = Math.max(1, Math.ceil(total / 100));
  const buybackPercent = getBuybackPercent(data?.marketConfig);
  const supported = data?.items?.capabilities?.exchange !== false;
  const selected = items.find(
    (item, index) =>
      `${item.template_id ?? item.templateId}-${item.quality_level ?? item.quality ?? index}` === selectedId,
  );
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
        <p role="alert" style={{ color: COLORS.red }}>
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
      <div className={layout.summary}>
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
      <p className={layout.notice}>Select an item to inspect seller prices and available stock.</p>
      <div className={layout.workspace}>
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
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.template_id ?? item.templateId}-${item.quality_level ?? item.quality ?? index}`}>
                    <td>
                      <button
                        className={layout.itemButton}
                        aria-pressed={selected === item}
                        onClick={() =>
                          setSelectedId(
                            `${item.template_id ?? item.templateId}-${item.quality_level ?? item.quality ?? index}`,
                          )
                        }
                      >
                        <ItemImage src={itemImage(item)} /> {item.display_name ?? item.name ?? item.template_id}
                      </button>
                    </td>
                    <td>{formatMarketNumber(item.quality_level ?? item.quality)}</td>
                    <td>{formatMarketNumber(item.listing_count ?? item.listings)}</td>
                    <td>{formatMarketNumber(item.total_stock ?? item.stock)}</td>
                    <td>{formatMarketNumber(item.lowest_price ?? item.lowestPrice)}</td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td colSpan={5} className={layout.empty}>
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
        <aside className={layout.sidebar}>
          <section className={dossier.panel}>
            <h2>Item intelligence</h2>
            {selected ? (
              <>
                <ItemImage src={itemImage(selected)} large />
                <h3>{selected.display_name ?? selected.name ?? selected.template_id}</h3>
                <dl className={dossier.facts}>
                  <div>
                    <dt>Grade</dt>
                    <dd>{formatMarketNumber(selected.quality_level ?? selected.quality)}</dd>
                  </div>
                  <div>
                    <dt>Lowest ask</dt>
                    <dd>{formatMarketNumber(selected.lowest_price ?? selected.lowestPrice)}</dd>
                  </div>
                  <div>
                    <dt>Available units</dt>
                    <dd>{formatMarketNumber(selected.total_stock ?? selected.stock)}</dd>
                  </div>
                  <div>
                    <dt>Open listings</dt>
                    <dd>{formatMarketNumber(selected.listing_count ?? selected.listings)}</dd>
                  </div>
                </dl>
              </>
            ) : (
              <p>Select an item to inspect its asking price, grade and available stock.</p>
            )}
          </section>
          {selected && (
            <section className={dossier.panel}>
              <PriceLadder
                key={`${owner}-${selectedId}`}
                owner={owner}
                templateId={String(selected.template_id ?? selected.templateId)}
                quality={String(selected.quality_level ?? selected.quality ?? '')}
              />
            </section>
          )}
          <section className={dossier.panel}>
            <h2>CHOAM buyback</h2>
            <p className={dossier.balance}>{buybackPercent == null ? '—' : `${buybackPercent}%`}</p>
            <p>Reported buyback rate. Item-specific caps and availability can vary.</p>
          </section>
          <section className={dossier.panel}>
            <h2>Market access</h2>
            <p>
              Browse current listings here. Complete purchases and manage listings through your server’s supported
              trading interface.
            </p>
          </section>
        </aside>
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
