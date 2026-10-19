'use client';
import styles from '../map.module.css';
import { useState } from 'react';
import type { ModelMarker } from './sceneModels';
import type { QualityChoice } from './renderQuality';
type Props = {
  markers: ModelMarker[];
  onLocate: (marker: ModelMarker) => void;
  onTop: () => void;
  onNorth: () => void;
  onFullscreen: () => void;
  onStyle: (style: 'relief' | 'atlas') => void;
  onContours: () => void;
  style: 'relief' | 'atlas';
  contours: boolean;
  quality: QualityChoice;
  onQuality: (quality: QualityChoice) => void;
};
export default function MapHud(props: Props) {
  const [query, setQuery] = useState('');
  const matches = query.trim()
    ? props.markers
        .filter((marker) =>
          String(`${marker.name ?? marker.label ?? ''} ${marker.subtype ?? ''} ${marker.type ?? ''}`)
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
        )
        .slice(0, 6)
    : [];
  return (
    <div data-map-hud className={styles.sceneHud}>
      <div className={styles.sceneTools} aria-label="Map view controls">
        <label>
          Terrain{' '}
          <select
            aria-label="Terrain style"
            value={props.style}
            onChange={(e) => props.onStyle(e.target.value as 'relief' | 'atlas')}
          >
            <option value="relief">Relief</option>
            <option value="atlas">Atlas</option>
          </select>
        </label>
        <label>
          Detail{' '}
          <select
            aria-label="Terrain detail"
            value={props.quality}
            onChange={(e) => props.onQuality(e.target.value as QualityChoice)}
          >
            <option value="auto">Auto</option>
            <option value="low">Low</option>
            <option value="balanced">Balanced</option>
            <option value="high">High</option>
          </select>
        </label>
        <button type="button" aria-pressed={props.contours} onClick={props.onContours}>
          Contours
        </button>
        <button type="button" onClick={props.onTop}>
          Top down
        </button>
        <button type="button" onClick={props.onFullscreen}>
          Fullscreen
        </button>
      </div>
      <div className={styles.sceneSearch}>
        <input
          aria-label="Find on map"
          placeholder="Find a base, vehicle or location"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim() && (
          <ul aria-label="Map search results">
            {matches.length ? (
              matches.map((marker, i) => (
                <li key={String(marker.id ?? i)}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onLocate(marker);
                      setQuery('');
                    }}
                  >
                    <span>{String(marker.name ?? marker.label ?? marker.subtype ?? 'Location')}</span>
                    <small>{String(marker.type)}</small>
                  </button>
                </li>
              ))
            ) : (
              <li>No matching locations</li>
            )}
          </ul>
        )}
      </div>
      <span data-terrain-coverage role="status" hidden className={styles.sceneCoverage} />
      <button
        type="button"
        className={styles.sceneCompass}
        aria-label="Face north"
        title="Face north"
        onClick={props.onNorth}
      >
        <span data-compass-arrow>↑</span>
        <b>N</b>
      </button>
      <div className={styles.sceneScale}>
        <span data-scale-label>1 km</span>
        <i data-scale-line />
      </div>
      <div className={styles.sceneGuidance}>
        <span>Drag to orbit · Right drag to pan · Scroll to zoom</span>
        <span>Click a location, then Fly to for a closer look</span>
      </div>
    </div>
  );
}
