'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

export default function useMapData(mapName = 'HaggaBasin') {
  const [mapConfig, setMapConfig] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const active = useRef<AbortController | null>(null);
  const loadMap = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoading(true);
    try {
      const response = await fetch(`/api/map?map=${encodeURIComponent(mapName)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error('Session ended. Return to the portal to sign in again.');
      if (!response.ok) throw new Error('Map telemetry is temporarily unavailable.');
      const data = await response.json();
      const map = getMapConfig(data);
      if (!data?.ok || !map) throw new Error('Map configuration is unavailable.');
      if (controller.signal.aborted) return;
      setMapConfig(map);
      setMarkers(getMarkerArray(data));
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
  }, [mapName]);
  useEffect(() => {
    setMapConfig(null);
    setMarkers([]);
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
  return { mapConfig, markers, error, loading, loadMap, reload: loadMap };
}
