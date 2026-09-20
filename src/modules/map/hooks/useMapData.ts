'use client';
import { cachedFetch } from '../../../lib/client-cache';

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeMapResolution } from '../utils/mapResolution';

const REFRESH_INTERVAL = 30_000;

function getMarkerArray(data) {
  if (Array.isArray(data?.markers)) {
    return data.markers;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return [];
}

function getMapConfig(data, mapName) {
  if (data?.map && typeof data.map === 'object') {
    return normalizeMapResolution(mapName, data.map);
  }

  if (data?.maps && data?.defaultMap && data.maps[data.defaultMap]) {
    return normalizeMapResolution(mapName, data.maps[data.defaultMap]);
  }

  if (data?.maps && typeof data.maps === 'object') {
    const firstMap = Object.values(data.maps)[0];

    if (firstMap) {
      return normalizeMapResolution(mapName, firstMap);
    }
  }

  if (data?.config && typeof data.config === 'object') {
    return normalizeMapResolution(mapName, data.config);
  }

  return null;
}

function getCoriolisLayout(data) {
  const layout = Number(data?.coriolisLayout);
  return Number.isInteger(layout) && layout >= 0 && layout <= 11 ? layout : null;
}

function getCoriolisCycleAt(data) {
  const value = data?.coriolisNextCycleAt;
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function getGridOverlay(data) {
  const overlay = data?.gridOverlay;
  if (overlay?.kind === 'deep-desert-sector-grid' && Array.isArray(overlay.lines) && Array.isArray(overlay.labels)) {
    return overlay;
  }
  return null;
}

export default function useMapData(mapName = 'HaggaBasin') {
  const [mapConfig, setMapConfig] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [coriolisLayout, setCoriolisLayout] = useState<number | null>(null);
  const [coriolisNextCycleAt, setCoriolisNextCycleAt] = useState<string | null>(null);
  const [gridOverlay, setGridOverlay] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const expired = useRef(false);
  const active = useRef<AbortController | null>(null);
  const loadMap = useCallback(
    async (force = false) => {
      if (active.current || expired.current) return;
      const controller = new AbortController();
      active.current = controller;
      const timeout = setTimeout(() => controller.abort(), 15000);
      setLoading(true);
      try {
        const response = await cachedFetch(`/api/map?map=${encodeURIComponent(mapName)}`, {
          force,
          onCached: async (cached) => {
            const data = await cached.json();
            if (!controller.signal.aborted) {
              setMapConfig(getMapConfig(data, mapName));
              setMarkers(getMarkerArray(data));
              setCoriolisLayout(getCoriolisLayout(data));
              setCoriolisNextCycleAt(getCoriolisCycleAt(data));
              setGridOverlay(getGridOverlay(data));
            }
          },
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          expired.current = true;
          setMarkers([]);
          setMapConfig(null);
          setCoriolisLayout(null);
          setCoriolisNextCycleAt(null);
          setGridOverlay(null);
          throw new Error('Session ended. Return to the portal to sign in again.');
        }
        if (!response.ok) throw new Error('Map telemetry is temporarily unavailable.');
        const data = await response.json();
        const map = getMapConfig(data, mapName);
        if (!data?.ok || !map) throw new Error('Map configuration is unavailable.');
        if (controller.signal.aborted) return;
        setMapConfig(map);
        setMarkers(getMarkerArray(data));
        setCoriolisLayout(getCoriolisLayout(data));
        setCoriolisNextCycleAt(getCoriolisCycleAt(data));
        setGridOverlay(getGridOverlay(data));
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
    [mapName],
  );
  useEffect(() => {
    setMapConfig(null);
    setMarkers([]);
    setCoriolisLayout(null);
    setCoriolisNextCycleAt(null);
    setGridOverlay(null);
    void loadMap();
    const refresh = () => {
      if (document.visibilityState === 'visible') void loadMap();
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
  return {
    mapConfig,
    markers,
    coriolisLayout,
    coriolisNextCycleAt,
    gridOverlay,
    error,
    loading,
    loadMap,
    reload: () => loadMap(true),
  };
}
