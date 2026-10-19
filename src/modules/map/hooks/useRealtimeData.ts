import { useEffect, useState } from 'react';
import type { RealtimeReading } from '../utils/realtime';

export default function useRealtimeData(mapName: string, mapAvailable: boolean) {
  const [enabled, setEnabled] = useState(true);
  const [reading, setReading] = useState<(RealtimeReading & { mapName: string }) | null>(null);
  const [status, setStatus] = useState('Connecting realtime…');
  const [partition, setPartition] = useState('');

  useEffect(() => {
    setReading(null);
    setPartition('');
    if (!enabled || !mapAvailable) {
      setStatus('Realtime off');
      return;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController | null = null;
    let stopped = false;
    setStatus('Connecting realtime…');
    const poll = async () => {
      if (disposed || stopped || controller || document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 8000);
      let delay = 2000;
      try {
        const response = await fetch(`/api/map/realtime?map=${encodeURIComponent(mapName)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const data = await response.json();
        if (disposed || controller.signal.aborted) return;
        if (!response.ok || !data.ok) {
          if (response.status === 401 || response.status === 403) stopped = true;
          throw new Error(typeof data.error === 'string' ? data.error : 'Realtime Data is unavailable.');
        }
        setReading({ ...data, mapName });
        setStatus(data.sources.some((source) => source.ready) ? 'Realtime · 2s updates' : 'Realtime sources not ready');
        setPartition((current) =>
          data.sources.some((source) => String(source.partition) === current)
            ? current
            : String(data.sources[0]?.partition ?? ''),
        );
      } catch (error) {
        if (disposed) return;
        setReading(null);
        setStatus(error instanceof Error && error.name !== 'AbortError' ? error.message : 'Realtime Data timed out.');
        delay = 30000;
      } finally {
        clearTimeout(timeout);
        controller = null;
        if (!disposed && !stopped) timer = setTimeout(() => void poll(), delay);
      }
    };
    const visibilityChanged = () => {
      if (document.visibilityState === 'visible') void poll();
      else {
        setReading(null);
        setStatus('Realtime paused');
        controller?.abort();
        clearTimeout(timer);
      }
    };
    void poll();
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', visibilityChanged);
    };
  }, [enabled, mapName, mapAvailable]);

  return {
    enabled,
    toggle: () => setEnabled((value) => !value),
    status,
    partition,
    setPartition,
    sources: enabled && mapAvailable && reading?.mapName === mapName ? reading.sources : [],
    markers:
      enabled && mapAvailable && reading?.mapName === mapName
        ? reading.markers.filter((marker) => String(marker.partition) === partition)
        : [],
  };
}
