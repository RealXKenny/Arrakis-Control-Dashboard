import { useEffect, useState } from 'react';
import { cachedFetch } from '../../../lib/client-cache';
import { useSiteConfig } from '../../../components/SiteConfigProvider';
export function useMarketData(query: string, page: number, sort = 'name', owner = 'all') {
  const site = useSiteConfig();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let disposed = false,
      unauthorized = false;
    let active: AbortController | null = null;
    let nextAllowed = 0;
    async function load(force = false) {
      if (disposed || active || unauthorized || Date.now() < nextAllowed || document.visibilityState === 'hidden')
        return;
      const controller = new AbortController();
      active = controller;
      const deadline = setTimeout(() => controller.abort(), site.requestTimeoutMs);
      setLoading(true);
      setError('');
      const apply = async (response: Response, cached: boolean) => {
        const body = await response.json();
        if (!disposed && !controller.signal.aborted) {
          setData({ ...body, requestedQuery: query, requestedPage: page, requestedSort: sort, requestedOwner: owner });
          setStale(cached);
          if (cached) setLoading(false);
        }
      };
      try {
        const params = new URLSearchParams({ q: query, page: String(page), sort, owner });
        const response = await cachedFetch(`/api/market?${params}`, {
          signal: controller.signal,
          force,
          onCached: (cached) => apply(cached, true),
        });
        if (response.status === 401 || response.status === 403) {
          unauthorized = true;
          setData(null);
          throw new Error('Your session has ended. Sign in to load the market.');
        }
        if (response.status === 429) {
          const retry = Number(response.headers.get('Retry-After'));
          nextAllowed = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 3600) : 60) * 1000;
        }
        if (!response.ok) throw new Error('Unable to load market data. Your last reading may be stale.');
        await apply(response, false);
      } catch (reason) {
        if (!disposed) {
          setStale(true);
          setError(reason instanceof Error ? reason.message : 'Unable to load market data.');
        }
      } finally {
        clearTimeout(deadline);
        active = null;
        if (!disposed) setLoading(false);
      }
    }
    const debounce = setTimeout(() => void load(revision > 0), 250);
    const poll = () => void load();
    const interval = setInterval(poll, site.pollIntervalMs);
    document.addEventListener('visibilitychange', poll);
    return () => {
      disposed = true;
      clearTimeout(debounce);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', poll);
      active?.abort();
    };
  }, [query, page, sort, owner, revision, site.pollIntervalMs, site.requestTimeoutMs]);
  const currentData =
    data?.requestedQuery === query &&
    data?.requestedPage === page &&
    data?.requestedSort === sort &&
    data?.requestedOwner === owner
      ? data
      : null;
  return { data: currentData, loading, error, stale, refresh: () => setRevision((value) => value + 1) };
}
