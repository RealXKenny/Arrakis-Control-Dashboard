import { useEffect, useMemo, useState } from 'react';
import { cachedFetch } from '../../../lib/client-cache';
import { useSiteConfig } from '../../../components/SiteConfigProvider';
import { fallbackMapDestinations, type MapDestination } from '../utils/destinations';

export function useMapDestinations() {
  const site = useSiteConfig();
  const fallback = useMemo(
    () =>
      fallbackMapDestinations.map((entry) => ({
        ...entry,
        label: entry.kind === 'deep-desert' ? site.mapLabels.DeepDesert : site.mapLabels.HaggaBasin,
      })),
    [site.mapLabels.DeepDesert, site.mapLabels.HaggaBasin],
  );
  const [destinations, setDestinations] = useState<MapDestination[]>(fallback);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), site.requestTimeoutMs);
    cachedFetch('/api/map/destinations', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('destinations');
        const body = await response.json();
        if (!disposed && Array.isArray(body.data) && body.data.length) setDestinations(body.data);
      })
      .catch(() => {
        if (!disposed) setDestinations(fallback);
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [fallback, site.requestTimeoutMs]);

  return { destinations, loading };
}
