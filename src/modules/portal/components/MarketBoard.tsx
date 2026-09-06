'use client';

import { useEffect, useMemo, useState } from 'react';
import { COLORS, styles } from '../config/colors';
import { formatNumber } from '../utils/formatting';

function rows(value, keys) {
  for (const key of keys) if (Array.isArray(value?.[key])) return value[key];
  return Array.isArray(value) ? value : [];
}

function itemImage(item) {
  const icon = String(item?.icon ?? '').trim();
  if (icon) {
    return icon.replace(/^\/images\/items\//, '/items/');
  }
  const templateId = String(item?.template_id ?? item?.templateId ?? '').trim();
  return templateId ? `/items/${encodeURIComponent(templateId)}.png` : '';
}

export default function MarketBoard() {
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/market', { cache: 'no-store', signal: controller.signal })
      .then((response) => response.json().then((body) => ({ response, body })))
      .then(({ response, body }) => {
        if (!response.ok || !body.ok) throw new Error(body.error || `Market API returned ${response.status}`);
        setData(body);
      })
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const items = rows(data?.items, ['rows', 'items']);
  const filteredItems = useMemo(() => items.filter((item) => String(item.display_name ?? item.name ?? '').toLowerCase().includes(query.toLowerCase())), [items, query]);
  const stats = data?.stats ?? {};
  const lowestPrices = items.map((item) => Number(item.lowest_price ?? item.lowestPrice)).filter(Number.isFinite);
  const highestPrices = items.map((item) => Number(item.highest_price ?? item.highestPrice ?? item.lowest_price ?? item.lowestPrice)).filter(Number.isFinite);
  const totalUnits = items.reduce((sum, item) => sum + (Number(item.total_stock) || 0), 0);
  const buybackPercent = data?.marketConfig?.buyback?.buybackPercent ?? data?.marketConfig?.buybackSchedule?.buybackPercent ?? data?.marketConfig?.buybackPercent ?? data?.marketConfig?.schedule?.buybackPercent;
  const getPrice = (item, keys) => { for (const key of keys) { const value = Number(item?.[key]); if (Number.isFinite(value)) return value; } return 0; };

  return (
    <section style={{ ...styles.panel, width: '100%', boxSizing: 'border-box', overflow: 'hidden', padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
        <div><p style={{ margin: '0 0 5px', color: COLORS.goldLight, fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.5px' }}>Choam Exchange</p><h2 style={styles.sectionTitle}>Market Board</h2></div>
        <button type="button" onClick={() => window.location.reload()} style={{ border: `1px solid ${COLORS.border}`, background: 'transparent', color: COLORS.goldLight, padding: '8px 12px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700 }}>Refresh Market</button>
      </div>
      {error && <p style={{ color: COLORS.red }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', border: `1px solid ${COLORS.border}` }}>
        {[['Listings', stats.totalListings ?? 0], ['Units', totalUnits], ['Lowest Ask', lowestPrices.length ? Math.min(...lowestPrices) : 0], ['Highest Ask', highestPrices.length ? Math.max(...highestPrices) : 0], ['Bot Ceiling', buybackPercent != null ? `${buybackPercent}%` : '—']].map(([label, value]) => <div key={label} style={{ minWidth: 0, padding: 16, textAlign: 'center', borderRight: `1px solid ${COLORS.border}` }}><div style={{ color: COLORS.muted, fontSize: '0.72rem' }}>{label}</div><strong style={{ color: COLORS.text, fontSize: '1rem' }}>{loading ? '—' : typeof value === 'string' ? value : formatNumber(value, 0)}</strong></div>)}
      </div>
      <div style={{ marginTop: 18, padding: 14, border: `1px solid ${COLORS.border}`, borderRadius: 6, background: COLORS.panel }}>
        <h3 style={{ ...styles.sectionTitle, fontSize: '1rem', marginBottom: 12 }}>Search the Market</h3>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter an item name, such as Spice" style={{ width: '100%', boxSizing: 'border-box', padding: 12, background: COLORS.input ?? '#17110d', border: `1px solid ${COLORS.border}`, borderRadius: 4, color: COLORS.text, outline: 'none' }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(5, minmax(60px, 1fr))', gap: 10, padding: '7px 4px', color: COLORS.muted, fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', borderBottom: `1px solid ${COLORS.border}` }}><span>Item</span><span>Listings</span><span>Units</span><span>Lowest Ask</span><span>Highest Ask</span><span>Bot Ceiling</span></div>
        <div style={{ marginTop: 12, maxHeight: 320, overflow: 'auto' }}>{filteredItems.length ? filteredItems.map((item) => { const units = Number(item.total_stock ?? item.stock ?? item.units ?? 0) || 0; const lowest = getPrice(item, ['lowest_price', 'lowestPrice', 'price']); const highest = getPrice(item, ['highest_price', 'highestPrice', 'highest_ask']) || lowest; const listings = Number(item.listing_count ?? item.listings ?? 0) || 0; const ceiling = buybackPercent != null ? highest * Number(buybackPercent) / 100 : 0; return <div key={`${item.template_id ?? item.templateId}-${item.quality_level ?? item.quality ?? ''}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(5, minmax(60px, 1fr))', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: `1px solid ${COLORS.borderLight}`, color: COLORS.textSoft, fontSize: '0.72rem' }}><span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, overflow: 'hidden' }}><img src={itemImage(item)} alt="" width="26" height="26" loading="lazy" style={{ objectFit: 'contain', flexShrink: 0 }} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.display_name ?? item.name ?? item.template_id}</span></span><span>{formatNumber(listings, 0)}</span><span>{formatNumber(units, 0)}</span><span>{formatNumber(lowest, 0)}</span><span>{formatNumber(highest, 0)}</span><span>{buybackPercent != null ? formatNumber(ceiling, 0) : '—'}</span></div>; }) : <div style={{ padding: 24, textAlign: 'center', color: COLORS.dim }}>{loading ? 'Loading market…' : 'No matching listings found.'}</div>}</div>
      </div>
    </section>
  );
}
