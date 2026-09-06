"use client";

import { useCallback, useEffect, useState } from "react";

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
  if (data?.map && typeof data.map === "object") {
    return data.map;
  }

  if (data?.maps && data?.defaultMap && data.maps[data.defaultMap]) {
    return data.maps[data.defaultMap];
  }

  if (data?.maps && typeof data.maps === "object") {
    const firstMap = Object.values(data.maps)[0];

    if (firstMap) {
      return firstMap;
    }
  }

  if (data?.config && typeof data.config === "object") {
    return data.config;
  }

  return null;
}

export default function useMapData(mapName = "HaggaBasin") {
  const [mapConfig, setMapConfig] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadMap = useCallback(
    async (signal) => {
      try {
        setLoading(true);

        const response = await fetch(`/api/map?map=${encodeURIComponent(mapName)}`, {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
          signal,
        });

        if (response.status === 401) {
          window.location.href = "/auth/login";
          return;
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);

          throw new Error(errorData?.error || `Map API returned ${response.status}`);
        }

        const data = await response.json();

        if (!data?.ok) {
          throw new Error(data?.error || "Map API returned an error.");
        }

        const map = getMapConfig(data);
        const rows = getMarkerArray(data);

        if (!map) {
          throw new Error("Map API did not return a map configuration.");
        }

        setMapConfig(map);
        setMarkers(rows);
        setError("");
      } catch (err) {
        if (err?.name === "AbortError") {
          return;
        }

        setError(err?.message || "Unable to load map data.");
      } finally {
        setLoading(false);
      }
    },
    [mapName],
  );

  useEffect(() => {
    const controller = new AbortController();

    void loadMap(controller.signal);

    const interval = window.setInterval(() => {
      const refreshController = new AbortController();

      void loadMap(refreshController.signal);

      window.setTimeout(() => {
        refreshController.abort();
      }, 15_000);
    }, REFRESH_INTERVAL);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [loadMap]);

  const reload = useCallback(() => {
    const controller = new AbortController();

    void loadMap(controller.signal);

    return () => controller.abort();
  }, [loadMap]);

  return {
    mapConfig,
    markers,
    error,
    loading,
    loadMap,
    reload,
  };
}
