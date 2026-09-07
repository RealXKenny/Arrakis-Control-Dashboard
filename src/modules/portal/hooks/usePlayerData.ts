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
  const expired = useRef(false);

  const load = useCallback(async () => {
    if (request.current || expired.current) return;
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(new Error('Request timed out')), 30000);
    setStatusLoading(true);
    try {
      const response = await fetch('/api/player', { cache: 'no-store', signal: controller.signal });
      if (response.status === 401) {
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
      setUpdatedAt(Date.now());
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
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRefresh);
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
    retry: load,
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
