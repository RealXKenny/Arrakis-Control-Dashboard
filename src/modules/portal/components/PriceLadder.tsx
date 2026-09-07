import { useEffect, useState } from 'react';
import { formatMarketNumber } from '../utils/market';
import { label, record, rows, type DataRow } from '../utils/inventory';
import css from '../dossier.module.css';

export default function PriceLadder({ templateId, quality }: { templateId: string; quality: string }) {
  const [state, setState] = useState<{ items: DataRow[] | null; error: string; loading: boolean }>({
    items: null,
    error: '',
    loading: true,
  });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timer = setTimeout(() => controller.abort(), 15000);
    setState({ items: null, error: '', loading: true });
    async function load() {
      try {
        const query = new URLSearchParams({ templateId, quality });
        const response = await fetch(`/api/market/listings?${query}`, { signal: controller.signal, cache: 'no-store' });
        const data = record(await response.json());
        if (!response.ok)
          throw new Error(response.status === 401 ? 'Sign in again to read the market.' : 'Price ladder unavailable.');
        if (!disposed) setState({ items: rows(data), error: '', loading: false });
      } catch (error) {
        if (!disposed)
          setState({
            items: null,
            error:
              error instanceof Error && error.message === 'Sign in again to read the market.'
                ? error.message
                : 'Price ladder unavailable. Please try again.',
            loading: false,
          });
      } finally {
        clearTimeout(timer);
      }
    }
    void load();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [templateId, quality, revision]);
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
