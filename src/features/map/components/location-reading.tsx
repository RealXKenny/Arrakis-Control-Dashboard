'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { MAP_LABELS, type MapName } from '../maps';
import { projectLocation } from '../utils/location-projection';
import { arrakeenCategories, arrakeenMarkers, markerSprites, type ArrakeenCategory } from '../utils/arrakeen-markers';
import { hubPoiAtlasCategory, hubPoiCategory, hubPoiTitle } from '../utils/hub-poi';
import styles from '../styles/map.module.css';
import useLivePlayer from '../hooks/use-live-player';
import useMapDrag from '../hooks/use-map-drag';

const readingSchema = z.object({
  ok: z.literal(true),
  location: z.enum(['Arrakeen', 'HarkoVillage']),
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
const hubPointsSchema = z.object({
  ok: z.literal(true),
  points: z
    .array(
      z.object({
        id: z.string().max(100),
        subtype: z.string().max(64),
        x: z.number().finite(),
        y: z.number().finite(),
      }),
    )
    .max(200),
});
type HubMarker = {
  id: number | string;
  title: string;
  category: ArrakeenCategory;
  left: number;
  top: number;
  sprite: [number, number];
};
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const clampZoom = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
const mapImages: Partial<Record<MapName, string>> = {
  Arrakeen: '/maps/arrakeen.png',
  HarkoVillage: '/maps/harko-village.png',
};

/** Only the linked character's position is returned by this view's server endpoint. */
export function LocationReading({ mapName }: { mapName: MapName }) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [status, setStatus] = useState('Loading location…');
  const [visibleCategories, setVisibleCategories] = useState<ArrakeenCategory[]>(arrakeenCategories);
  const [selectedMarker, setSelectedMarker] = useState<number | string | null>(null);
  const [hubMarkers, setHubMarkers] = useState<HubMarker[]>([]);
  useEffect(() => {
    setHubMarkers([]);
    if (mapName !== 'HarkoVillage') return;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch('/api/v2/map/poi?map=HarkoVillage', {
          cache: 'no-store',
          signal: controller.signal,
        });
        const parsed = hubPointsSchema.safeParse(await response.json());
        if (!response.ok || !parsed.success) return;
        setHubMarkers(
          parsed.data.points.flatMap((point) => {
            const place = projectLocation('HarkoVillage', point);
            const sprite = markerSprites[hubPoiAtlasCategory(point.subtype)];
            return place && sprite
              ? [
                  {
                    id: point.id,
                    title: hubPoiTitle(point.subtype),
                    category: hubPoiCategory(point.subtype),
                    ...place,
                    sprite,
                  },
                ]
              : [];
          }),
        );
      } catch {
        /* Points are optional; the map still works without them. */
      }
    })();
    return () => controller.abort();
  }, [mapName]);
  const livePlayer = useLivePlayer(mapName, Boolean(reading?.position));
  const active = useRef<AbortController | null>(null);
  const refresh = useCallback(async () => {
    if (document.hidden || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    const timer = setTimeout(() => controller.abort(), 15000);
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
      if (active.current === controller) {
        setReading(null);
        setStatus('Location reading is unavailable.');
      }
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
  const [zoom, setZoom] = useState(1.5);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const zoomAnchor = useRef<{ fx: number; fy: number; vx: number; vy: number } | null>(null);
  const { drag, handleMouseDown, handleMouseMove, stopDragging } = useMapDrag({ frameRef });
  // Zoom around a viewport point so the map under the cursor stays put, as on the Hagga Basin map.
  const zoomAround = useCallback((next: number, point?: { clientX: number; clientY: number }) => {
    const frame = frameRef.current;
    const target = clampZoom(next);
    if (frame && frame.firstElementChild instanceof HTMLElement) {
      const rect = frame.getBoundingClientRect();
      const content = frame.firstElementChild.getBoundingClientRect();
      const vx = point ? point.clientX - rect.left : rect.width / 2;
      const vy = point ? point.clientY - rect.top : rect.height / 2;
      zoomAnchor.current = {
        fx: (rect.left + vx - content.left) / content.width,
        fy: (rect.top + vy - content.top) / content.height,
        vx,
        vy,
      };
    }
    setZoom(target);
  }, []);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const anchor = zoomAnchor.current;
    zoomAnchor.current = null;
    if (!frame || !anchor || !(frame.firstElementChild instanceof HTMLElement)) return;
    const content = frame.firstElementChild;
    const marginLeft = Math.max(0, (frame.clientWidth - content.offsetWidth) / 2);
    const marginTop = Math.max(0, (frame.clientHeight - content.offsetHeight) / 2);
    frame.scrollLeft = anchor.fx * content.offsetWidth + marginLeft - anchor.vx;
    frame.scrollTop = anchor.fy * content.offsetHeight + marginTop - anchor.vy;
  }, [zoom]);
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAround(zoom * (event.deltaY < 0 ? 1.12 : 0.88), event);
    };
    frame.addEventListener('wheel', wheel, { passive: false });
    return () => frame.removeEventListener('wheel', wheel);
  }, [zoom, zoomAround]);
  const marker = reading?.position ? projectLocation(mapName, livePlayer ?? reading.position) : null;
  const allMarkers: HubMarker[] = mapName === 'Arrakeen' ? arrakeenMarkers : hubMarkers;
  const locations = allMarkers.filter((item) => visibleCategories.includes(item.category));
  const selected = locations.find((item) => item.id === selectedMarker);
  return (
    <div className={styles.workspace} data-map-workspace data-map-mode="2d">
      <Card as="section" aria-label={`${MAP_LABELS[mapName]} live map`} className={styles.mapPanel} data-map-panel>
        <div className={styles.toolbar}>
          <span className="text-sm text-sand-200">{MAP_LABELS[mapName]} · 2D map</span>
          <Button type="button" onClick={() => void refresh()} className={styles.mapButton}>
            Refresh map
          </Button>
          <span className="text-xs text-sand-400">Character marker is approximate</span>
          {livePlayer && <span className="text-xs text-sand-400">Live position · inferred match</span>}
          <div className={styles.zoomControls} role="group" aria-label="Map zoom">
            <Button
              type="button"
              className={styles.mapButton}
              aria-label="Zoom out"
              disabled={zoom <= MIN_ZOOM}
              onClick={() => zoomAround(zoom / 1.25)}
            >
              −
            </Button>
            <span className={styles.zoomReading} aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              className={styles.mapButton}
              aria-label="Zoom in"
              disabled={zoom >= MAX_ZOOM}
              onClick={() => zoomAround(zoom * 1.25)}
            >
              +
            </Button>
          </div>
        </div>
        <div
          ref={frameRef}
          className={`${styles.mapViewport} flex min-h-0 flex-1 overflow-auto`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          style={{ cursor: drag ? 'grabbing' : 'grab' }}
        >
          {mapImages[mapName] && (
            <div className="relative m-auto shrink-0" style={{ width: `${zoom * 100}%` }}>
              {/* These local game maps are served through the same-origin asset route. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={mapImages[mapName]}
                alt={`${MAP_LABELS[mapName]} map`}
                className="h-auto w-full rounded-lg"
                draggable={false}
              />
              {locations.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  aria-label={`${item.title} (${item.category})`}
                  aria-pressed={item.id === selectedMarker}
                  title={item.title}
                  onClick={() => setSelectedMarker(item.id)}
                  className="hag-map-marker absolute z-10 h-8 w-6 -translate-x-1/2 -translate-y-full border-0 bg-transparent p-0 focus-visible:z-30 focus-visible:outline-2 focus-visible:outline-white"
                  style={{
                    left: `${item.left}%`,
                    top: `${item.top}%`,
                    backgroundImage: 'url(/maps/arrakeen-marker-atlas.webp)',
                    backgroundSize: `${(1074 * 24) / 66}px ${(1208 * 24) / 66}px`,
                    backgroundPosition: `${(-item.sprite[0] * 24) / 66}px ${(-item.sprite[1] * 24) / 66}px`,
                  }}
                />
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
        </div>
        {(!reading || !reading.position) && (
          <p role="status" className="mt-6 text-sm text-sand-200">
            {status}
          </p>
        )}
        {reading?.position && !marker && (
          <p className="mt-4 text-sm text-sand-300">Your position is outside the map image.</p>
        )}
        <div className={styles.statusBar}>{locations.length} map markers · positions refresh every 30 seconds</div>
      </Card>
      <Card as="aside" className={styles.mapLegend} aria-label="Location layers">
        <h2 className={styles.mapLegendHeader}>Map layers</h2>
        <div className={`${styles.mapLegendBody} p-4`}>
          <p className="mt-3 text-sm leading-relaxed text-sand-400">
            Your linked character’s position is private to you. Other players are not shown.
          </p>
          {allMarkers.length > 0 && (
            <div className="mt-5">
              <fieldset>
                <legend className="text-sm text-sand-200">Map markers</legend>
                {arrakeenCategories
                  .filter((category) => allMarkers.some((item) => item.category === category))
                  .map((category) => (
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
                      {category} ({allMarkers.filter((item) => item.category === category).length})
                    </label>
                  ))}
              </fieldset>
              <p className="mt-4 text-xs text-sand-400">
                {mapName === 'Arrakeen'
                  ? 'Marker positions are approximate. Source: Map Genie.'
                  : 'Marker positions are approximate. Source: Dune Console points of interest.'}
              </p>
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
        </div>
      </Card>
    </div>
  );
}
