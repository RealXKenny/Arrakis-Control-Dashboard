'use client';

import React from 'react';

import MapToolbar from './MapToolbar';
import MapCanvas from './MapCanvas';
import MarkerDetails from './MarkerDetails';
import MapStatusBar from './MapStatusBar';

import useMapData from '../hooks/useMapData';
import useMapZoom from '../hooks/useMapZoom';
import useMapDrag from '../hooks/useMapDrag';
import useMapWindow from '../hooks/useMapWindow';

import styles from '../map.module.css';

const LEGEND_STORAGE_KEY_PREFIX = 'map-legend';

const LEGEND_CATEGORIES = [
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
    label: 'Static Spice Spawns',
  },
  {
    type: 'spice_active',
    label: 'Active Spice Blows',
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

export default function MapWindow({
  mapName = 'HaggaBasin',
  title = 'HAGGA BASIN',
  offset = { x: 0, y: 0 },
  split = false,
  onMapChange,
}) {
  const { mapConfig, markers, error, loading, loadMap } = useMapData(mapName);

  const legendStorageKey = `${LEGEND_STORAGE_KEY_PREFIX}-${mapName}`;

  const [selected, setSelected] = React.useState(null);

  const target = null;

  const [legendDisabled, setLegendDisabled] = React.useState({});

  const [legendExpanded, setLegendExpanded] = React.useState({
    vehicle: false,
    poi: false,
    house_representative: false,
    trainer: false,
  });

  const [legendOpen, setLegendOpen] = React.useState(true);

  const frameRef = React.useRef(null);

  const canvasRef = React.useRef(null);

  const { windowState, windowDrag, handleWindowMouseDown, minimize, restore, toggleMaximize, close } = useMapWindow(
    mapConfig,
    offset,
    split,
  );

  const { zoom, setZoomAround, fitMap, zoomPercent } = useMapZoom({
    mapConfig,
    frameRef,
    canvasRef,
  });

  const { drag, handleMouseDown, handleMouseMove, stopDragging } = useMapDrag({
    frameRef,
  });

  React.useEffect(() => {
    try {
      const saved = window.localStorage.getItem(legendStorageKey);

      if (!saved) {
        return;
      }

      const parsed = JSON.parse(saved);

      if (parsed && typeof parsed === 'object') {
        if (parsed.disabled && typeof parsed.disabled === 'object') {
          setLegendDisabled(parsed.disabled);
        }

        if (parsed.expanded && typeof parsed.expanded === 'object') {
          setLegendExpanded((current) => ({
            ...current,
            ...parsed.expanded,
          }));
        }

        if (typeof parsed.open === 'boolean') {
          setLegendOpen(parsed.open);
        }
      }
    } catch {
      // Ignore invalid cached legend state.
    }
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
        // Ignore localStorage failures.
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

  const terminalStyle = {
    left: windowState.maximized ? 0 : windowState.x,

    top: windowState.maximized ? 0 : windowState.y,

    width: windowState.maximized ? 'calc(100vw - 270px)' : windowState.width,

    height: windowState.maximized ? '100vh' : windowState.height,

    zIndex: 100,

    borderRadius: windowState.maximized ? 0 : '8px 0 0 8px',

    borderRight: '1px solid #6f4e2d',

    overflow: 'hidden',
  };

  const legendStyle = {
    left: windowState.maximized ? 'auto' : windowState.x + windowState.width,

    right: windowState.maximized ? 0 : 'auto',

    top: windowState.maximized ? 0 : windowState.y,

    width: 270,

    height: windowState.maximized ? '100vh' : windowState.height,

    zIndex: 99,

    borderRadius: windowState.maximized ? 0 : '0 8px 8px 0',
  };

  const refreshMap = React.useCallback(() => {
    void loadMap();
  }, [loadMap]);

  const handleKeyDown = React.useCallback(
    (event) => {
      if (event.key === 'Escape') {
        setSelected(null);
        return;
      }

      if (event.key === '+' || event.key === '=') {
        event.preventDefault();

        setZoomAround(zoom * 1.18);

        return;
      }

      if (event.key === '-') {
        event.preventDefault();

        setZoomAround(zoom * 0.84);

        return;
      }

      if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        fitMap();
        return;
      }

      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        refreshMap();
      }
    },
    [zoom, setZoomAround, fitMap, refreshMap],
  );

  React.useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);

  return (
    <main
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 40%, #392717 0%, #1a1109 45%, #080604 100%)',
        color: '#e5d2b3',
        fontFamily: '"Cascadia Code", "Cascadia Mono", Consolas, "Courier New", monospace',
      }}
    >
      {!windowState.minimized && (
        <>
          <div className={styles.terminal} style={terminalStyle}>
            <div
              className={styles.titleBar}
              onMouseDown={handleWindowMouseDown}
              onDoubleClick={toggleMaximize}
              style={{
                cursor: windowState.maximized ? 'default' : windowDrag ? 'grabbing' : 'grab',
              }}
            >
              <div className={styles.titleIcon}>▸_</div>

              <div className={styles.title}>{title} — LIVE MAP</div>

              {onMapChange && (
                <select
                  value={mapName}
                  onChange={(event) => onMapChange(event.target.value)}
                  onMouseDown={(event) => event.stopPropagation()}
                  title="Select map"
                  style={{
                    marginRight: 8,
                    background: '#24180e',
                    border: '1px solid #624324',
                    color: '#d9c19c',
                    fontFamily: 'inherit',
                    fontSize: 10,
                    padding: '3px 5px',
                  }}
                >
                  <option value="HaggaBasin">Hagga Basin</option>
                  <option value="DeepDesert">Deep Desert</option>
                </select>
              )}

              <button
                type="button"
                title="Minimize"
                className={styles.windowButton}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={minimize}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#4a311c';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                −
              </button>

              <button
                type="button"
                title="Maximize"
                className={styles.windowButton}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={toggleMaximize}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#4a311c';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';
                }}
              >
                {windowState.maximized ? '❐' : '□'}
              </button>

              <button
                type="button"
                title="Close"
                className={styles.windowButton}
                onMouseDown={(event) => event.stopPropagation()}
                onClick={close}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = '#7c2f20';

                  event.currentTarget.style.color = '#fff';
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = 'transparent';

                  event.currentTarget.style.color = '#bda987';
                }}
              >
                ×
              </button>
            </div>

            <MapToolbar
              zoomPercent={zoomPercent}
              onZoomOut={() => setZoomAround(zoom * 0.84)}
              onZoomIn={() => setZoomAround(zoom * 1.18)}
              onFit={fitMap}
              onRefresh={refreshMap}
            />

            <div
              ref={frameRef}
              className="hag-map-frame"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDragging}
              onMouseLeave={stopDragging}
              style={{
                position: 'relative',
                flex: 1,
                minHeight: 0,
                minWidth: 0,
                overflow: 'auto',
                cursor: drag ? 'grabbing' : 'grab',
                background: '#0c0804',
                scrollbarWidth: 'thin',
                scrollbarColor: '#594127 #100b07',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {mapConfig ? (
                <MapCanvas
                  mapName={mapName}
                  mapConfig={mapConfig}
                  markers={visibleMarkers}
                  zoom={zoom}
                  canvasRef={canvasRef}
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
                    color: '#806d55',
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
                        color: '#d8a75f',
                        marginBottom: 8,
                      }}
                    >
                      C:\HAGGA\MAP&gt;
                    </div>

                    {loading ? 'Loading map...' : 'Map unavailable'}
                  </div>
                </div>
              )}

              <MarkerDetails marker={selected} onClose={() => setSelected(null)} />
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
              loading={loading}
              error={error}
              markerCount={markers.length}
              zoomPercent={zoomPercent}
              target={target}
            />
          </div>

          <aside className={`${styles.mapLegend} ${legendOpen ? '' : styles.mapLegendCollapsed}`} style={legendStyle}>
            <button
              type="button"
              className={styles.mapLegendHeader}
              onClick={toggleLegendOpen}
              title={legendOpen ? 'Collapse map legend' : 'Expand map legend'}
            >
              <span>MAP LEGEND</span>

              <span>{legendOpen ? '−' : '+'}</span>
            </button>

            {legendOpen && (
              <div className={styles.mapLegendBody}>
                {LEGEND_CATEGORIES.map((category) => {
                  const categoryDisabled = !!legendDisabled[category.type];

                  const hasSubtypes = Array.isArray(category.subtypes) && category.subtypes.length > 0;

                  const expanded = !!legendExpanded[category.type];

                  return (
                    <div key={category.type} className={styles.mapLegendCategory}>
                      <div className={styles.mapLegendCategoryRow}>
                        <button
                          type="button"
                          className={styles.mapLegendCategoryButton}
                          onClick={() => toggleLegendCategory(category.type)}
                          title={categoryDisabled ? `Show ${category.label}` : `Hide ${category.label}`}
                        >
                          <span className={styles.mapLegendCategoryName}>{category.label}</span>
                        </button>

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
                              <button
                                type="button"
                                key={key}
                                className={styles.mapLegendSubtype}
                                onClick={() => toggleLegendItem(key)}
                                title={disabled ? `Show ${label}` : `Hide ${label}`}
                              >
                                <span className={styles.mapLegendIconSmall}>
                                  <span className={getLegendIconClass(category, normalized)} />
                                </span>

                                <span className={styles.mapLegendSubtypeName}>{label}</span>

                                <span className={disabled ? styles.mapLegendDisabledIcon : styles.mapLegendEnabledIcon}>
                                  {disabled ? '×' : '●'}
                                </span>
                              </button>
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
        </>
      )}

      {windowState.minimized && (
        <button
          type="button"
          onClick={restore}
          style={{
            position: 'fixed',
            left: 15,
            bottom: 15,
            zIndex: 200,
            height: 38,
            padding: '0 16px',
            background: '#24180e',
            border: '1px solid #6f4e2d',
            color: '#ead8ba',
            boxShadow: '0 10px 30px rgba(0,0,0,.7)',
            cursor: 'pointer',
            fontFamily: '"Cascadia Code", Consolas, monospace',
            fontSize: 11,
            borderRadius: 5,
          }}
        >
          <span
            style={{
              color: '#d8a75f',
              marginRight: 8,
            }}
          >
            ▸_
          </span>
          {title} — LIVE MAP
        </button>
      )}
    </main>
  );
}
