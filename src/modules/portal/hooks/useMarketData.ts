import { useEffect, useState } from 'react';

export function useMarketData(query: string, page: number, sort = 'name', owner = 'all') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const deadline = setTimeout(
      () => controller.abort(new Error('Market request timed out. Please try again.')),
      30000,
    );
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q: query, page: String(page), sort, owner });
        const response = await fetch(`/api/market?${params}`, { cache: 'no-store', signal: controller.signal });
        const body = await response.json();
        if (!response.ok || !body.ok)
          throw new Error(
            response.status === 401
              ? 'Your session has ended. Sign in to load the market.'
              : body.error || 'Unable to load market data.',
          );
        if (!controller.signal.aborted)
          setData({ ...body, requestedQuery: query, requestedPage: page, requestedSort: sort, requestedOwner: owner });
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : 'Unable to load market data.');
      } finally {
        clearTimeout(deadline);
        if (!disposed) setLoading(false);
      }
    }, 250);
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearTimeout(deadline);
      controller.abort();
    };
  }, [query, page, revision, sort, owner]);
  const currentData =
    data?.requestedQuery === query &&
    data?.requestedPage === page &&
    data?.requestedSort === sort &&
    data?.requestedOwner === owner
      ? data
      : null;
  return { data: currentData, loading, error, refresh: () => setRevision((value) => value + 1) };
}
