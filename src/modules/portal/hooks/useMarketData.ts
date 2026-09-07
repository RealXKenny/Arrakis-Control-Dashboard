import { useEffect, useState } from 'react';

export function useMarketData(query: string, page: number) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, page: String(page) });
        const response = await fetch(`/api/market?${params}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error(response.status === 401 ? 'Your session has ended. Sign in to load the market.' : body.error || 'Unable to load market data.');
        if (!controller.signal.aborted) setData({ ...body, requestedQuery: query, requestedPage: page });
      } catch (reason) {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Unable to load market data.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, page, revision]);
  const currentData = data?.requestedQuery === query && data?.requestedPage === page ? data : null;
  return { data: currentData, loading, error, refresh: () => setRevision(value => value + 1) };
}
