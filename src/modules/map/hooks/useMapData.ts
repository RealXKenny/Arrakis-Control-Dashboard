'use client';
import { cachedFetch } from '../../../lib/client-cache';

import { useCallback, useEffect, useRef, useState } from 'react';

const REFRESH_INTERVAL = 5_000;
const STATIC_MARKER_TYPES = new Set([
  'spice',
  'ore',
  'scrap',
  'flora',
  'poi',
  'house_representative',
  'trainer',
  'fortress',
  'hazard',
  'enemy',
]);

function mergeLiveMarkers(current, incoming) {
  return [
    ...current.filter((marker) => STATIC_MARKER_TYPES.has(String(marker?.type || '').toLowerCase())),
    ...incoming.filter((marker) => !STATIC_MARKER_TYPES.has(String(marker?.type || '').toLowerCase())),
  ];
}

function getMarkerArray(data) {
  if (Array.isArray(data?.markers)) {
    return data.markers;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return [];
}

function getMapConfig(data) {
  if (data?.map && typeof data.map === 'object') {
    return data.map;
  }

  if (data?.maps && data?.defaultMap && data.maps[data.defaultMap]) {
    return data.maps[data.defaultMap];
  }

  if (data?.maps && typeof data.maps === 'object') {
    const firstMap = Object.values(data.maps)[0];

    if (firstMap) {
      return firstMap;
    }
  }

  if (data?.config && typeof data.config === 'object') {
    return data.config;
  }

  return null;
}

export default function useMapData(mapName = 'HaggaBasin', partitionId: string | null = null) {
  const [mapConfig, setMapConfig] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [mapMeta, setMapMeta] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const expired = useRef(false);
  const active = useRef<AbortController | null>(null);
  const loadMap = useCallback(
    async (force = false, liveOnly = false) => {
      if (active.current || expired.current) return;
      const controller = new AbortController();
      active.current = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      setLoading(true);
      try {
        const query = new URLSearchParams({ map: mapName });
        if (partitionId) query.set('partitionId', partitionId);
        if (liveOnly) query.set('static', '0');
        const response = await cachedFetch(`/api/map?${query}`, {
          force,
          onCached: async (cached) => {
            const data = await cached.json();
            if (!controller.signal.aborted) {
              setMapConfig(getMapConfig(data));
              setMarkers((current) =>
                liveOnly ? mergeLiveMarkers(current, getMarkerArray(data)) : getMarkerArray(data),
              );
              setMapMeta(data);
            }
          },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          expired.current = true;
          setMarkers([]);
          setMapConfig(null);
          throw new Error('Session ended. Return to the portal to sign in again.');
        }
        if (!response.ok) throw new Error('Map telemetry is temporarily unavailable.');
        const data = await response.json();
        const map = getMapConfig(data);
        if (!data?.ok || !map) throw new Error('Map configuration is unavailable.');
        if (controller.signal.aborted) return;
        setMapConfig(map);
        setMarkers((current) => (liveOnly ? mergeLiveMarkers(current, getMarkerArray(data)) : getMarkerArray(data)));
        setMapMeta(data);
        setError('');
      } catch (reason) {
        if (active.current === controller) setError(reason instanceof Error ? reason.message : 'Unable to load map.');
      } finally {
        clearTimeout(timeout);
        if (active.current === controller) {
          active.current = null;
          setLoading(false);
        }
      }
    },
    [mapName, partitionId],
  );
  useEffect(() => {
    setMapConfig(null);
    setMarkers([]);
    setMapMeta({});
    void loadMap();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadMap(true, true);
    };
    const timer = setInterval(refresh, REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      const controller = active.current;
      active.current = null;
      controller?.abort();
    };
  }, [loadMap]);
  return { mapConfig, markers, mapMeta, error, loading, loadMap, reload: () => loadMap(true, false) };
}
