import { cachedFetch } from '../../../lib/client-cache';
import { useEffect, useState } from 'react';
import { formatMarketNumber } from '../utils/market';
import { label, record, rows, type DataRow } from '../utils/inventory';
import css from '../dossier.module.css';
import { useSiteConfig } from '../../../components/SiteConfigProvider';

export default function PriceLadder({
  templateId,
  quality,
  owner = 'all',
}: {
  templateId: string;
  quality: string;
  owner?: string;
}) {
  const site = useSiteConfig();
  const [state, setState] = useState<{ items: DataRow[] | null; error: string; loading: boolean }>({
    items: null,
    error: '',
    loading: true,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false,
      unauthorized = false;
    let active: AbortController | null = null;
    let nextAllowed = 0;
    setState({ items: null, error: '', loading: true });
    async function load(force = false) {
      if (disposed || active || unauthorized || Date.now() < nextAllowed || document.visibilityState === 'hidden')
        return;
      const controller = new AbortController();
      active = controller;
      const timer = setTimeout(() => controller.abort(), site.requestTimeoutMs);
      try {
        const query = new URLSearchParams({ templateId, quality, owner });
        const response = await cachedFetch(`/api/market/listings?${query}`, {
          signal: controller.signal,
          force,
          onCached: async (cached) => {
            const data = record(await cached.json());
            if (!disposed) setState({ items: rows(data), error: '', loading: true });
          },
        });
        if (response.status === 401 || response.status === 403) unauthorized = true;
        if (response.status === 429) {
          const retry = Number(response.headers.get('Retry-After'));
          nextAllowed = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 60) * 1000;
        }
        if (!response.ok) throw new Error('Price ladder unavailable');
        const data = record(await response.json());
        if (!disposed) setState({ items: rows(data), error: '', loading: false });
      } catch {
        if (!disposed)
          setState((previous) => ({
            items: unauthorized ? null : previous.items,
            error: unauthorized
              ? 'Sign in again to read the market.'
              : 'Price ladder unavailable. Displayed sell orders may be stale.',
            loading: false,
          }));
      } finally {
        clearTimeout(timer);
        active = null;
      }
    }
    void load(revision > 0);
    const poll = () => void load();
    const interval = setInterval(poll, site.pollIntervalMs);
    document.addEventListener('visibilitychange', poll);
    return () => {
      disposed = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
      active?.abort();
    };
  }, [templateId, quality, owner, revision, site.pollIntervalMs, site.requestTimeoutMs]);
  return (
    <section aria-label="Price ladder" aria-busy={state.loading}>
      <h2>Price ladder</h2>
      {state.loading && <p role="status">Reading sell orders…</p>}
      {state.error && (
        <p role="alert">
          {state.error} <button onClick={() => setRevision((value) => value + 1)}>Retry ladder</button>
        </p>
      )}
      {!state.loading && !state.error && !state.items?.length && <p>No sell orders reported.</p>}
      <ul className={css.equipment}>
        {state.items?.map((item, index) => (
          <li key={label(item.id, String(index))}>
            <div>
              <strong>{label(item.owner_name, 'Unknown seller')}</strong>
              <small>
                {formatMarketNumber(item.stock)} units · {label(item.owner_type)}
              </small>
            </div>
            <b>{formatMarketNumber(item.item_price ?? item.price)}</b>
          </li>
        ))}
      </ul>
    </section>
  );
}
