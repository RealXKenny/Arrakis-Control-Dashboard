import { useEffect, useRef, useState } from 'react';

import { REFRESH_INTERVAL } from '../config/progression';
import { extractBases, getBaseId } from '../utils/bases';

export function usePlayerData() {

  const [player, setPlayer] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  const [statusLoading, setStatusLoading] =
    useState(false);

  const refreshInProgress = useRef(false);

  const [basesTelemetry, setBasesTelemetry] =
    useState({});

  const [basesLoading, setBasesLoading] =
    useState(false);

  const [baseTab, setBaseTab] =
    useState('owned');

  const [vehicleTab, setVehicleTab] =
    useState('owned');

  async function loadBaseTelemetry(bases) {
    if (
      !Array.isArray(bases) ||
      bases.length === 0
    ) {
      setBasesTelemetry({});
      setBasesLoading(false);
      return;
    }

    setBasesLoading(false);

    const results = bases.map((base) => {
      const baseId = getBaseId(base);
      return {
        id: baseId,
        water: base?.water ?? base?.waterData ?? base?.waterSummary ?? null,
        inventory: base?.inventory ?? base?.inventoryData ?? null,
        waterError: null,
        inventoryError: null,
      };
    });

    const nextTelemetry = {};

    for (const result of results) {
      if (result.id) {
        nextTelemetry[result.id] =
          result;
      }
    }

    setBasesTelemetry(
      nextTelemetry
    );

    setBasesLoading(false);
  }

  async function loadPlayerData(showLoading = false) {
    if (refreshInProgress.current) {
      return;
    }

    refreshInProgress.current = true;

    try {
      if (showLoading) {
        setLoading(true);
      }

      setStatusLoading(true);

      const res = await fetch('/api/player', {
        cache: 'no-store',
      });

      if (res.status === 401) {
        window.location.href = '/auth/login';
        return;
      }

      if (!res.ok) {
        console.error(
          'Player API returned:',
          res.status
        );
        return;
      }

      const data = await res.json();
      const bases = extractBases(data);

      /*
      * Keep the old telemetry visible.
      * This prevents cards from disappearing/reappearing
      * during refresh.
      */
      setPlayer(data);

      await loadBaseTelemetry(bases);
    } catch (error) {
      console.error(
        'Failed to fetch player data:',
        error
      );
    } finally {
      setStatusLoading(false);
      refreshInProgress.current = false;

      if (showLoading) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialLoad() {
      if (cancelled) {
        return;
      }

      await loadPlayerData(true);
    }

    initialLoad();

    const interval = setInterval(() => {
      if (!cancelled) {
        loadPlayerData(false);
      }
    }, REFRESH_INTERVAL);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);
  return {
    player,
    loading,
    statusLoading,
    basesTelemetry,
    basesLoading,
    baseTab,
    setBaseTab,
    vehicleTab,
    setVehicleTab,
  };
}
