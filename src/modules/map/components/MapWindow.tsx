'use client';

import React from 'react';
import { uniqueMapMarkers } from '../utils/markers';
import dynamic from 'next/dynamic';
import type { MapCamera } from '../terrain/MapScene3D';

const MapScene3D = dynamic(() => import('../terrain/MapScene3D'), { ssr: false });

import MapToolbar from './MapToolbar';
import MapCanvas from './MapCanvas';
import MarkerDetails from './MarkerDetails';
import MapStatusBar from './MapStatusBar';

import useMapData from '../hooks/useMapData';
import useRealtimeData from '../hooks/useRealtimeData';
import useMapZoom from '../hooks/useMapZoom';
import useMapDrag from '../hooks/useMapDrag';

import styles from '../map.module.css';

const LEGEND_STORAGE_KEY_PREFIX = 'map-legend';
const DEFAULT_DISABLED_MARKERS = {
  realtime_npc: true,
  civilian: true,
  storage: true,
  ore: true,
  scrap: true,
  flora: true,
  fortress: true,
  hazard: true,
  enemy: true,
};
const DEFAULT_EXPANDED_MARKERS = {
  vehicle: false,
  poi: false,
  house_representative: false,
  trainer: false,
};

const LEGEND_CATEGORIES = [
  { type: 'worm', label: 'Sandworms (realtime)' },
  { type: 'realtime_npc', label: 'NPCs (realtime)' },
  { type: 'civilian', label: 'Civilians (realtime)' },
  { type: 'storm', label: 'Sandstorms (realtime)' },
  { type: 'coriolis', label: 'Coriolis (realtime)' },
  {
    type: 'sector-grid',
    label: 'Sector Grid',
    map: 'DeepDesert',
  },
  {
    type: 'player',
    label: 'Player',
  },
  {
    type: 'vehicle',
    label: 'Vehicle',
    subtypes: [
      ['sandbike', 'Sandbike'],
      ['buggy', 'Buggy'],
      ['sandcrawler', 'Sandcrawler'],
      ['treadwheel', 'Treadwheel'],
      ['assaultornithopter', 'Assault Ornithopter'],
      ['ornithopter', 'Ornithopter'],
      ['lightornithopter', 'Light Ornithopter'],
      ['mediumornithopter', 'Medium Ornithopter'],
      ['transportornithopter', 'Transport Ornithopter'],
      ['containervehicle', 'Container Vehicle'],
    ],
  },
  {
    type: 'base',
    label: 'Base',
  },
  {
    type: 'storage',
    label: 'Storage',
  },
  {
    type: 'spice',
    label: 'Possible Spice Locations',
  },
  {
    type: 'spice_active',
    label: 'Active Spice Fields',
  },
  {
    type: 'flour_sand',
    label: 'Flour Sand',
  },
  {
    type: 'ore',
    label: 'Ore & Pickups',
  },
  {
    type: 'scrap',
    label: 'Wreckage & Scrap',
  },
  {
    type: 'flora',
    label: 'Flora',
  },
  {
    type: 'poi',
    label: "POI's",
    subtypes: [
      ['cave', 'Cave'],
      ['ecolab', 'Ecolab'],
      ['shipwreck', 'Shipwreck'],
      ['sietch', 'Sietch'],
      ['tradingpost', 'Trading Post'],
      ['taxiservice', 'Taxi Service'],
    ],
  },
  {
    type: 'house_representative',
    label: 'House Representative',
    subtypes: [
      ['houserepresentativeargosaz', 'Argosaz'],
      ['houserepresentativedyvetz', 'Dyvetz'],
      ['houserepresentativeecaz', 'Ecaz'],
      ['houserepresentativehagal', 'Hagal'],
      ['houserepresentativehurata', 'Hurata'],
      ['houserepresentativeimota', 'Imota'],
      ['houserepresentativekenola', 'Kenola'],
      ['houserepresentativelindaren', 'Lindaren'],
      ['houserepresentativemaros', 'Maros'],
      ['houserepresentativemikarrol', 'Mikarrol'],
      ['houserepresentativemoritani', 'Moritani'],
      ['houserepresentativenovebruns', 'Novebruns'],
      ['houserepresentativerichese', 'Richese'],
      ['houserepresentativesor', 'Sor'],
      ['houserepresentativetaligari', 'Taligari'],
      ['houserepresentativethorvald', 'Thorvald'],
      ['houserepresentativevernius', 'Vernius'],
    ],
  },
  {
    type: 'trainer',
    label: 'Trainer',
    subtypes: [
      ['trainerbenegesserit', 'Bene Gesserit'],
      ['trainermentat', 'Mentat'],
      ['trainerplanetologist', 'Planetologist'],
      ['trainerswordmaster', 'Swordmaster'],
      ['trainertrooper', 'Trooper'],
    ],
  },
  {
    type: 'fortress',
    label: 'Fortresses',
  },
  {
    type: 'hazard',
    label: 'Hazards',
  },
  {
    type: 'enemy',
    label: 'Enemies',
  },
];

function normalizeSubtype(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

function getLegendIconClass(category, subtype) {
  if (subtype) {
    return ['live-map-marker', `marker-${category.type}`, `subtype-${subtype}`].join(' ');
  }

  if (category.subtypes?.length) {
    return ['live-map-marker', `marker-${category.type}`, `subtype-${category.subtypes[0][0]}`].join(' ');
  }

  return ['live-map-marker', `marker-${category.type}`].join(' ');
}

export default function MapWindow({ mapName = 'HaggaBasin' }: { mapName?: string }) {
  const {
    mapConfig,
    markers: staticMarkers,
    coriolisLayout,
    coriolisNextCycleAt,
    gridOverlay,
    error,
    loading,
    loadMap,
  } = useMapData(mapName);
  const realtime = useRealtimeData(mapName, Boolean(mapConfig));
  const markers = React.useMemo(
    () => uniqueMapMarkers([...staticMarkers, ...realtime.markers]),
    [staticMarkers, realtime.markers],
  );

  const legendStorageKey = `${LEGEND_STORAGE_KEY_PREFIX}-${mapName}-v2`;

  const [selected, setSelected] = React.useState(null);
  const [view3D, setView3D] = React.useState(true);
  const [sceneStatus, setSceneStatus] = React.useState('Loading 3D terrain…');
  const cameraRef = React.useRef<MapCamera | null>(null);
  const [hudTarget, setHudTarget] = React.useState<HTMLDivElement | null>(null);

  const target = null;

  const [legendDisabled, setLegendDisabled] = React.useState<Record<string, boolean>>(() => ({
    ...DEFAULT_DISABLED_MARKERS,
  }));

  const [legendExpanded, setLegendExpanded] = React.useState({ ...DEFAULT_EXPANDED_MARKERS });

  const [legendOpen, setLegendOpen] = React.useState(true);

  const frameRef = React.useRef(null);

  const canvasRef = React.useRef(null);

  const { zoom, setZoomAround, fitMap, zoomPercent } = useMapZoom({
    mapConfig,
    frameRef,
    canvasRef,
  });

  const { drag, handleMouseDown, handleMouseMove, stopDragging } = useMapDrag({
    frameRef,
  });

  React.useEffect(() => {
    let disabled = { ...DEFAULT_DISABLED_MARKERS };
    let expanded = { ...DEFAULT_EXPANDED_MARKERS };
    let open = true;
    try {
      const saved = window.localStorage.getItem(legendStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          if (parsed.disabled && typeof parsed.disabled === 'object') disabled = { ...disabled, ...parsed.disabled };
          if (parsed.expanded && typeof parsed.expanded === 'object') expanded = { ...expanded, ...parsed.expanded };
          if (typeof parsed.open === 'boolean') open = parsed.open;
        }
      }
    } catch {
      // Dev note: stale legend settings are returned to the sands.
    }
    setLegendDisabled(disabled);
    setLegendExpanded(expanded);
    setLegendOpen(open);
  }, [legendStorageKey]);

  const saveLegendState = React.useCallback(
    (disabled, expanded, open) => {
      try {
        window.localStorage.setItem(
          legendStorageKey,
          JSON.stringify({
            disabled,
            expanded,
            open,
          }),
        );
      } catch {
        // Dev note: the map works even when localStorage takes a personal day.
      }
    },
    [legendStorageKey],
  );

  const toggleLegendItem = React.useCallback(
    (key) => {
      setLegendDisabled((current) => {
        const next = {
          ...current,
          [key]: !current[key],
        };

        saveLegendState(next, legendExpanded, legendOpen);

        return next;
      });
    },
    [legendExpanded, legendOpen, saveLegendState],
  );

  const toggleLegendCategory = React.useCallback(
    (type) => {
      toggleLegendItem(type);
    },
    [toggleLegendItem],
  );

  const toggleLegendExpanded = React.useCallback(
    (type) => {
      setLegendExpanded((current) => {
        const next = {
          ...current,
          [type]: !current[type],
        };

        saveLegendState(legendDisabled, next, legendOpen);

        return next;
      });
    },
    [legendDisabled, legendOpen, saveLegendState],
  );

  const toggleLegendOpen = React.useCallback(() => {
    setLegendOpen((current) => {
      const next = !current;

      saveLegendState(legendDisabled, legendExpanded, next);

      return next;
    });
  }, [legendDisabled, legendExpanded, saveLegendState]);

  const visibleMarkers = React.useMemo(() => {
    return markers.filter((marker) => {
      const type = String(marker?.type || '')
        .trim()
        .toLowerCase();

      const subtype = normalizeSubtype(marker?.subtype);

      if (legendDisabled[type]) {
        return false;
      }

      if (subtype && legendDisabled[`${type}:${subtype}`]) {
        return false;
      }

      return true;
    });
  }, [markers, legendDisabled]);

  const refreshMap = React.useCallback(() => {
    void loadMap(true);
  }, [loadMap]);

  const handleKeyDown = React.useCallback(
    (event) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, select, textarea, button, a')) return;
      if (event.key === 'Escape') {
        setSelected(null);
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();

        if (view3D) cameraRef.current?.zoom(1.18);
        else setZoomAround(zoom * 1.18);

        return;
      }

      if (event.key === '-') {
        event.preventDefault();

        if (view3D) cameraRef.current?.zoom(0.84);
        else setZoomAround(zoom * 0.84);

        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        if (view3D) cameraRef.current?.fit();
        else fitMap();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        refreshMap();
      }
    },
    [zoom, setZoomAround, fitMap, refreshMap, view3D],
  );

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <div className={styles.workspace} data-map-workspace data-map-mode={view3D ? '3d' : '2d'}>
      <section className={styles.mapPanel} data-map-panel>
        <MapToolbar
          view3D={view3D}
          onToggleView={() => {
            setView3D(!view3D);
            setSceneStatus('Loading 3D terrain…');
          }}
          zoomPercent={zoomPercent}
          coriolisNextCycleAt={coriolisNextCycleAt}
          onZoomOut={() => (view3D ? cameraRef.current?.zoom(0.84) : setZoomAround(zoom * 0.84))}
          onZoomIn={() => (view3D ? cameraRef.current?.zoom(1.18) : setZoomAround(zoom * 1.18))}
          onFit={() => (view3D ? cameraRef.current?.fit() : fitMap())}
          onRefresh={refreshMap}
        />

        {view3D && <div ref={setHudTarget} className={styles.sceneControlBar} data-map-controls />}

        <div
          ref={frameRef}
          className={`${styles.mapViewport} hag-map-frame`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            overflow: view3D ? 'hidden' : 'auto',
            cursor: drag ? 'grabbing' : 'grab',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--theme-border) var(--theme-surface)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {mapConfig && view3D ? (
            <MapScene3D
              key={`${mapName}:${coriolisLayout}`}
              mapName={mapName}
              mapConfig={mapConfig}
              layout={coriolisLayout}
              markers={visibleMarkers}
              gridOverlay={gridOverlay}
              showSectorGrid={!legendDisabled['sector-grid']}
              cameraRef={cameraRef}
              hudTarget={hudTarget}
              onSelectMarker={setSelected}
              onReady={() => setSceneStatus('')}
              onUnavailable={(reason) => {
                setSceneStatus(`3D unavailable: ${reason}. Showing 2D map.`);
                setView3D(false);
              }}
            />
          ) : mapConfig ? (
            <MapCanvas
              mapName={mapName}
              mapConfig={mapConfig}
              markers={visibleMarkers}
              zoom={zoom}
              canvasRef={canvasRef}
              frameRef={frameRef}
              coriolisLayout={coriolisLayout}
              gridOverlay={gridOverlay}
              showSectorGrid={!legendDisabled['sector-grid']}
              target={target}
              onSelectMarker={setSelected}
            />
          ) : (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                color: 'var(--theme-muted)',
                fontSize: 12,
              }}
            >
              <div
                style={{
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    color: 'var(--theme-text)',
                    marginBottom: 8,
                  }}
                >
                  {mapName === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin'}
                </div>

                {loading ? 'Loading map...' : 'Map unavailable'}
              </div>
            </div>
          )}

          <MarkerDetails
            marker={selected?.realtime ? realtime.markers.find((marker) => marker.id === selected.id) : selected}
            onClose={() => setSelected(null)}
            onFlyTo={view3D ? () => cameraRef.current?.focus(selected) : undefined}
          />
          {sceneStatus && (view3D || sceneStatus.startsWith('3D unavailable')) && (
            <span
              role="status"
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 30,
                color: 'var(--theme-soft)',
                background: 'var(--theme-masthead)',
                padding: '5px 8px',
                fontSize: 11,
              }}
            >
              {sceneStatus}
            </span>
          )}
        </div>

        {error && (
          <div
            style={{
              padding: '5px 10px',
              color: '#c76b55',
              background: 'rgba(80,20,10,.35)',
              borderTop: '1px solid rgba(124,47,32,.5)',
              fontSize: 10,
            }}
          >
            MAP ERROR: {error}
          </div>
        )}

        <MapStatusBar
          view3D={view3D}
          loading={loading}
          error={error}
          markerCount={visibleMarkers.length}
          zoomPercent={zoomPercent}
          target={target}
        />
      </section>

      <aside className={`${styles.mapLegend} ${legendOpen ? '' : styles.mapLegendCollapsed}`}>
        <button
          type="button"
          className={styles.mapLegendHeader}
          onClick={toggleLegendOpen}
          title={legendOpen ? 'Collapse map legend' : 'Expand map legend'}
        >
          <span>Map layers</span>

          <span>{legendOpen ? '−' : '+'}</span>
        </button>

        {legendOpen && (
          <div className={styles.realtimeControls}>
            <button
              type="button"
              className={styles.mapButton}
              aria-pressed={realtime.enabled}
              onClick={realtime.toggle}
            >
              Realtime {realtime.enabled ? 'on' : 'off'}
            </button>
            {realtime.enabled && realtime.sources.length > 0 && (
              <select
                aria-label="Realtime instance"
                value={realtime.partition}
                onChange={(event) => realtime.setPartition(event.target.value)}
              >
                {realtime.sources.map((source) => (
                  <option key={source.partition} value={source.partition}>
                    Instance {source.partition}
                    {source.ready ? '' : ' (not ready)'}
                  </option>
                ))}
              </select>
            )}
            <span role="status">{realtime.status}</span>
          </div>
        )}

        {legendOpen && (
          <div className={styles.mapLegendBody}>
            {LEGEND_CATEGORIES.filter((category) => !category.map || category.map === mapName).map((category) => {
              const categoryDisabled = !!legendDisabled[category.type];

              const hasSubtypes = Array.isArray(category.subtypes) && category.subtypes.length > 0;

              const expanded = !!legendExpanded[category.type];

              return (
                <div key={category.type} className={styles.mapLegendCategory}>
                  <div className={styles.mapLegendCategoryRow}>
                    <label
                      className={styles.mapLegendCategoryButton}
                      title={categoryDisabled ? `Show ${category.label}` : `Hide ${category.label}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.legendCheckbox}
                        checked={!categoryDisabled}
                        onChange={() => toggleLegendCategory(category.type)}
                      />
                      <span className={styles.mapLegendCategoryName}>{category.label}</span>
                    </label>

                    {hasSubtypes && (
                      <button
                        type="button"
                        className={styles.mapLegendExpandButton}
                        onClick={() => toggleLegendExpanded(category.type)}
                        title={expanded ? `Collapse ${category.label}` : `Expand ${category.label}`}
                      >
                        {expanded ? '⌄' : '›'}
                      </button>
                    )}
                  </div>

                  {hasSubtypes && expanded && (
                    <div className={styles.mapLegendSubtypes}>
                      {category.subtypes.map(([subtype, label]) => {
                        const normalized = normalizeSubtype(subtype);

                        const key = `${category.type}:${normalized}`;

                        const disabled = !!legendDisabled[key];

                        return (
                          <label
                            key={key}
                            className={styles.mapLegendSubtype}
                            title={disabled ? `Show ${label}` : `Hide ${label}`}
                          >
                            <input
                              type="checkbox"
                              className={styles.legendCheckbox}
                              checked={!categoryDisabled && !disabled}
                              disabled={categoryDisabled}
                              onChange={() => toggleLegendItem(key)}
                            />
                            <span className={styles.mapLegendIconSmall}>
                              <span className={getLegendIconClass(category, normalized)} />
                            </span>

                            <span className={styles.mapLegendSubtypeName}>{label}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
}
