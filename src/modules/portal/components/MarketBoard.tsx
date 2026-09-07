import { useState } from 'react';
import { COLORS, styles } from '../config/colors';
import { useMarketData } from '../hooks/useMarketData';
import { formatMarketNumber, getBuybackPercent } from '../utils/market';
import layout from '../market.module.css';

export default function MarketBoard() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const { data, loading, error, refresh } = useMarketData(query, page);
  const items = Array.isArray(data?.items?.rows) ? data.items.rows : [];
  const total = Number(data?.items?.totalCount ?? items.length);
  const pages = Math.max(1, Math.ceil(total / 100));
  const buybackPercent = getBuybackPercent(data?.marketConfig);
  const supported = data?.items?.capabilities?.exchange !== false;
  return (
    <section className={layout.board} style={styles.panel} aria-busy={loading}>
      <div className={layout.header}>
        <div><p className={layout.eyebrow}>CHOAM Exchange</p><h2 style={styles.sectionTitle}>Market Board</h2></div>
        <button type="button" onClick={refresh} disabled={loading}>{loading ? 'Loading…' : 'Refresh Market'}</button>
      </div>
      {error && <p role="alert" style={{ color: COLORS.red }}>{error} <button type="button" onClick={refresh}>Try again</button></p>}
      {data?.warnings?.map(message => <p key={message} className={layout.notice}>{message}</p>)}
      <div className={layout.summary}>
        <div><span>Total listings</span><strong>{formatMarketNumber(data?.stats?.totalListings)}</strong></div>
        <div><span>Matching items</span><strong>{data ? formatMarketNumber(total) : '—'}</strong></div>
        <div><span>Buyback rate</span><strong>{buybackPercent == null ? '—' : `${buybackPercent}%`}</strong></div>
      </div>
      <p className={layout.notice}>One row per item and grade. Buyback caps depend on the bot’s seed plan, not the highest market ask.</p>
      <label className={layout.search}>Search the market
        <input value={query} maxLength={128} onChange={event => { setQuery(event.target.value); setPage(0); }} placeholder="Search all items, categories, or template IDs" />
      </label>
      <div className={layout.tableViewport}>
        <table>
          <thead><tr><th>Item</th><th>Grade</th><th>Listings</th><th>Units</th><th>Lowest ask</th></tr></thead>
          <tbody>
            {items.map((item, index) => <tr key={`${item.template_id ?? item.templateId}-${item.quality_level ?? item.quality ?? index}`}>
              <td>{item.display_name ?? item.name ?? item.template_id}</td>
              <td>{formatMarketNumber(item.quality_level ?? item.quality)}</td>
              <td>{formatMarketNumber(item.listing_count ?? item.listings)}</td>
              <td>{formatMarketNumber(item.total_stock ?? item.stock)}</td>
              <td>{formatMarketNumber(item.lowest_price ?? item.lowestPrice)}</td>
            </tr>)}
            {!items.length && <tr><td colSpan={5} className={layout.empty}>{loading ? 'Loading market…' : error ? 'Market data could not be loaded.' : !supported ? 'Exchange data is unavailable on this server.' : 'No matching listings found.'}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={layout.pagination}>
        <button type="button" disabled={page === 0 || loading} onClick={() => setPage(value => value - 1)}>Previous</button>
        <span aria-live="polite">Page {page + 1} of {pages}{error && data ? ' · showing last loaded data' : ''}</span>
        <button type="button" disabled={page + 1 >= pages || loading || Boolean(error)} onClick={() => setPage(value => value + 1)}>Next</button>
      </div>
    </section>
  );
}
