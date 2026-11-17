'use client';
import { useEffect, useState } from 'react';
import { z } from 'zod';

const resultSchema = z.object({
  ok: z.literal(true),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      z: z.number().finite(),
      partition: z.number().int().nonnegative(),
      pawnId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    })
    .nullable(),
});

/** Agent identities are inferred on the server; a null reading leaves the Console position in place. */
export default function useLivePlayer(mapName: string, enabled: boolean) {
  const [reading, setReading] = useState<{ map: string; position: z.infer<typeof resultSchema>['position'] } | null>(
    null,
  );
  useEffect(() => {
    setReading(null);
    if (!enabled) return;
    let active: AbortController | null = null;
    let expiry: ReturnType<typeof setTimeout> | undefined;
    let next: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let stopped = false;
    const poll = async () => {
      if (disposed || stopped || active || document.hidden) return;
      clearTimeout(next);
      const controller = new AbortController();
      active = controller;
      const timer = setTimeout(() => controller.abort(), 8000);
      let delay = 15000;
      try {
        const response = await fetch(`/api/v2/map/player-live?map=${encodeURIComponent(mapName)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) stopped = true;
        if (response.status === 429) delay = 30000;
        const parsed = resultSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) throw new Error('Unavailable');
        if (parsed.data.position) delay = 3000;
        if (!disposed && active === controller) {
          clearTimeout(expiry);
          setReading({ map: mapName, position: parsed.data.position });
          if (parsed.data.position) expiry = setTimeout(() => setReading(null), 6000);
        }
      } catch {
        if (!disposed && active === controller) setReading(null);
      } finally {
        clearTimeout(timer);
        if (active === controller) {
          active = null;
          if (!disposed && !stopped && !document.hidden) next = setTimeout(() => void poll(), delay);
        }
      }
    };
    const visibility = () => {
      if (document.hidden) {
        active?.abort();
        active = null;
        clearTimeout(next);
        clearTimeout(expiry);
        setReading(null);
      } else void poll();
    };
    void poll();
    document.addEventListener('visibilitychange', visibility);
    return () => {
      disposed = true;
      active?.abort();
      clearTimeout(expiry);
      clearTimeout(next);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [mapName, enabled]);
  return enabled && reading?.map === mapName ? reading.position : null;
}
