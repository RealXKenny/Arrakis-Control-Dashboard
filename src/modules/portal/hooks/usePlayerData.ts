import { cachedFetch, capturedAt, clearClientReadCache } from '../../../lib/client-cache';
import { captureException } from '@sentry/nextjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { REFRESH_INTERVAL } from '../config/progression';
import { extractBases, getBaseId } from '../utils/bases';

/** One request at a time; unmounts abort work and background tabs stop polling. */
export function usePlayerData() {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [baseTab, setBaseTab] = useState('owned');
  const [vehicleTab, setVehicleTab] = useState('owned');
  const request = useRef<AbortController | null>(null);
  const nextAllowed = useRef(0);
  const expired = useRef(false);

  const load = useCallback(async (force = false) => {
    if (request.current || expired.current || Date.now() < nextAllowed.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), 30000);
    setStatusLoading(true);
    try {
      const response = await cachedFetch('/api/player', {
        signal: controller.signal,
        force,
        onCached: async (cached) => {
          if (!controller.signal.aborted) {
            setPlayer(await cached.json());
            setUpdatedAt(capturedAt(cached));
            setLoading(false);
          }
        },
      });
      if (response.status === 429) {
        const seconds = Number(response.headers.get('Retry-After'));
        const wait = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 3600) : 60;
        nextAllowed.current = Date.now() + wait * 1000;
        setError(`Refresh paused for ${Math.ceil(wait)} seconds. Your last reading is preserved.`);
        return;
      }
      nextAllowed.current = Date.now() + 5000;
      if (response.status === 401) {
        clearClientReadCache();
        expired.current = true;
        setSessionExpired(true);
        setPlayer(null);
        setError('Your session has ended. Connect Discord to continue.');
        return;
      }
      if (!response.ok) throw new Error(`Player telemetry returned ${response.status}`);
      const data = await response.json();
      if (controller.signal.aborted) return;
      setPlayer(data);
      setUpdatedAt(capturedAt(response));
      setError('');
    } catch (reason) {
      if (request.current !== controller) return;
      captureException(reason);
      setError('Telemetry is temporarily unavailable. Any displayed readings are from the last successful sync.');
    } finally {
      clearTimeout(timeout);
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
        setStatusLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const visibleRefresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    const timer = setInterval(visibleRefresh, REFRESH_INTERVAL);
    document.addEventListener('visibilitychange', visibleRefresh);
    const invalidate = () => {
      nextAllowed.current = 0;
      void load(true);
    };
    window.addEventListener('api-cache-invalidated', invalidate);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRefresh);
      window.removeEventListener('api-cache-invalidated', invalidate);
      const controller = request.current;
      request.current = null;
      controller?.abort();
    };
  }, [load]);

  const basesTelemetry = Object.fromEntries(
    extractBases(player).map((base) => [
      getBaseId(base),
      {
        water: base.water ?? base.waterData ?? base.waterSummary ?? null,
        inventory: base.inventory ?? base.inventoryData ?? null,
        waterError: null,
        inventoryError: null,
      },
    ]),
  );
  return {
    player,
    error,
    retry: () => load(true),
    loading,
    statusLoading,
    sessionExpired,
    updatedAt,
    basesTelemetry,
    basesLoading: false,
    baseTab,
    setBaseTab,
    vehicleTab,
    setVehicleTab,
  };
}
