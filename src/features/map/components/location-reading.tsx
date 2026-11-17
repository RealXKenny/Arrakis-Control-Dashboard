'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { MAP_LABELS, type MapName } from '../maps';
import { projectLocation } from '../utils/location-projection';
import { arrakeenCategories, arrakeenMarkers, type ArrakeenCategory } from '../utils/arrakeen-markers';

const readingSchema = z.object({
  ok: z.literal(true),
  location: z.enum(['Arrakeen', 'HarkoVillage', 'Overland']),
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
      z: z.number().finite(),
      partition: z.number().int().nonnegative(),
    })
    .nullable(),
  observedAt: z.string().datetime(),
});
type Reading = z.infer<typeof readingSchema>;
const referenceMaps: Partial<Record<MapName, string>> = {
  Arrakeen: 'https://duneawakening.th.gl/maps/Arrakeen',
  HarkoVillage: 'https://duneawakening.th.gl/maps/Harko%20Village',
  Overland: 'https://duneawakening.th.gl/maps/Overland%20Map',
};
const mapImages: Partial<Record<MapName, string>> = {
  Arrakeen: '/maps/arrakeen.png',
  HarkoVillage: '/maps/harko-village.png',
  Overland: '/maps/overland.webp',
};

/** Only the linked character's position is returned by this view's server endpoint. */
export function LocationReading({ mapName }: { mapName: MapName }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [status, setStatus] = useState('Loading location…');
  const [visibleCategories, setVisibleCategories] = useState<ArrakeenCategory[]>(arrakeenCategories);
  const [selectedMarker, setSelectedMarker] = useState<number | null>(null);
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (document.hidden || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
    setReading(null);
    setStatus('Checking location…');
    try {
      const response = await fetch(`/api/v2/map?map=${encodeURIComponent(mapName)}`, {
        cache: 'no-store',
        signal: controller.signal,
      });
      const parsed = readingSchema.safeParse(await response.json());
      if (!response.ok || !parsed.success || parsed.data.location !== mapName)
        throw new Error('Location reading is unavailable.');
      if (active.current !== controller) return;
      setReading(parsed.data);
      setStatus(
        parsed.data.position
          ? 'Your linked character is in this location.'
          : 'Your linked character was not reported online in this location.',
      );
    } catch {
      if (active.current === controller) setStatus('Location reading is unavailable.');
    } finally {
      clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }, [mapName]);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30000);
    const visibility = () => {
      if (document.hidden) {
        active.current?.abort();
        active.current = null;
        setReading(null);
        setStatus('Location reading paused while this page is hidden.');
      } else void refresh();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      active.current?.abort();
      active.current = null;
    };
  }, [refresh]);
  const marker = reading?.position ? projectLocation(mapName, reading.position) : null;
  const locations =
    mapName === 'Arrakeen' ? arrakeenMarkers.filter((item) => visibleCategories.includes(item.category)) : [];
  const selected = locations.find((item) => item.id === selectedMarker);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card as="section" aria-labelledby="location-heading" className="panel min-h-[24rem] p-6 sm:p-8">
        <p className="eyebrow">Location telemetry</p>
        <h2 id="location-heading" className="mt-3 text-2xl">
          {MAP_LABELS[mapName]}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-sand-300">
          {mapName === 'Arrakeen'
            ? 'Your marker is approximate. Accuracy may vary across the map.'
            : 'This map has not been calibrated yet, so coordinates are shown without a plotted marker.'}
        </p>
        {mapImages[mapName] && (
          <div className="relative mt-6">
            {/* These local game maps are served through the same-origin asset route. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapImages[mapName]} alt={`${MAP_LABELS[mapName]} map`} className="h-auto w-full rounded-lg" />
            {locations.map((item) => (
              <Button
                key={item.id}
                type="button"
                aria-label={`${item.title} (${item.category})`}
                aria-pressed={item.id === selectedMarker}
                title={item.title}
                onClick={() => setSelectedMarker(item.id)}
                className="absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-spice-600 p-0 text-xs text-white focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-white"
                style={{ left: `${item.left}%`, top: `${item.top}%` }}
              >
                <span aria-hidden="true">•</span>
              </Button>
            ))}
            {marker && (
              <span
                role="img"
                aria-label="Your approximate position"
                title="Your approximate position"
                className="pointer-events-none absolute z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-fuchsia-500 shadow-lg"
                style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
              />
            )}
          </div>
        )}
        <p role="status" className="mt-6 text-sm text-sand-200">
          {status}
        </p>
        {reading?.position && (
          <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(
              [
                ['X', reading.position.x],
                ['Y', reading.position.y],
                ['Z', reading.position.z],
                ['Partition', reading.position.partition],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="border border-sand-200/10 bg-obsidian-900/50 p-4">
                <dt className="text-xs uppercase tracking-wider text-sand-400">{label}</dt>
                <dd className="mt-2 break-all font-mono text-sm text-sand-100">
                  {label === 'Partition' ? value : value.toFixed(2)}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {reading?.position && mapName === 'Arrakeen' && !marker && (
          <p className="mt-4 text-sm text-sand-300">Your position is outside the map image.</p>
        )}
        {reading && (
          <p className="mt-5 text-xs text-sand-400">
            Last checked <LocalTime value={reading.observedAt} />. Values are raw world coordinates.
          </p>
        )}
        <Button
          type="button"
          onClick={() => void refresh()}
          className="mt-6 min-h-12 border border-spice-500/50 px-5 text-sm text-spice-300"
        >
          Refresh reading
        </Button>
      </Card>
      <Card as="aside" className="panel p-6" aria-label="Location layers">
        <h2 className="text-base">Available layers</h2>
        <p className="mt-3 text-sm leading-relaxed text-sand-400">
          Your linked character’s position is private to you. Other players are not shown.
        </p>
        {mapName === 'Arrakeen' && (
          <div className="mt-5">
            <fieldset>
              <legend className="text-sm text-sand-200">Map markers</legend>
              {arrakeenCategories.map((category) => (
                <label key={category} className="mt-3 flex items-center gap-2 text-sm text-sand-300">
                  <input
                    type="checkbox"
                    checked={visibleCategories.includes(category)}
                    onChange={() =>
                      setVisibleCategories((current) =>
                        current.includes(category)
                          ? current.filter((item) => item !== category)
                          : [...current, category],
                      )
                    }
                  />
                  {category} ({arrakeenMarkers.filter((item) => item.category === category).length})
                </label>
              ))}
            </fieldset>
            <p className="mt-4 text-xs text-sand-400">Marker positions are approximate. Source: Map Genie.</p>
            {selected && (
              <p role="status" className="mt-4 text-sm text-sand-100">
                {selected.title} — {selected.category}
              </p>
            )}
            <details className="mt-4 text-sm text-sand-300">
              <summary className="cursor-pointer">Browse visible markers ({locations.length})</summary>
              <ul className="mt-2 max-h-72 space-y-1 overflow-auto">
                {locations.map((item) => (
                  <li key={item.id}>
                    <Button
                      type="button"
                      onClick={() => setSelectedMarker(item.id)}
                      className="min-h-10 text-left underline"
                    >
                      {item.title}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        )}
        <p className="mt-4 text-xs text-sand-500">Readings refresh every 30 seconds while this page is visible.</p>
        {referenceMaps[mapName] && (
          <a
            href={referenceMaps[mapName]}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex min-h-12 items-center text-sm text-spice-300 underline"
          >
            Open community map (external)
          </a>
        )}
      </Card>
    </div>
  );
}
