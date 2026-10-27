'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import MapMarker from './MapMarker';
import SectorGridOverlay from './SectorGridOverlay';
import TiledMapImage from './TiledMapImage';

import { worldToMapPoint } from '../utils/coordinates';

import { markerKey } from '../utils/markers';

const DeepDesertTerrain = dynamic(() => import('../terrain/DeepDesertTerrain'), { ssr: false });

export default function MapCanvas({
  mapName = 'HaggaBasin',
  mapConfig,
  markers,
  zoom,
  canvasRef,
  frameRef,
  coriolisLayout,
  gridOverlay,
  showSectorGrid = true,
  target,
  onSelectMarker,
}) {
  const [terrainReady, setTerrainReady] = useState(false);
  const [terrainError, setTerrainError] = useState('');
  const isDeepDesert = mapName === 'DeepDesert';
  const terrainEnabled =
    isDeepDesert && Number.isInteger(coriolisLayout) && coriolisLayout >= 0 && coriolisLayout <= 11;
  const terrainMessage = terrainError || (!terrainEnabled && isDeepDesert ? 'current layout was not reported' : '');

  useEffect(() => {
    setTerrainReady(false);
    setTerrainError('');
  }, [mapName, coriolisLayout]);

  const plottedMarkers = useMemo(() => {
    if (!mapConfig) {
      return [];
    }

    return markers
      .map((marker, index) => ({
        marker,
        index,
        point: worldToMapPoint(marker, mapConfig),
      }))
      .filter(({ point }) => point && point.inBounds);
  }, [markers, mapConfig]);

  const targetPoint = useMemo(() => {
    if (!target || !mapConfig) {
      return null;
    }

    return worldToMapPoint(target, mapConfig);
  }, [target, mapConfig]);

  if (!mapConfig) {
    return null;
  }

  const width = Number(mapConfig.width) * zoom;

  const height = Number(mapConfig.height) * zoom;

  const gridSize = Math.max(25, 100 * zoom);

  return (
    <div
      ref={canvasRef}
      data-terrain-state={
        !isDeepDesert ? 'disabled' : terrainReady ? 'ready' : terrainMessage ? 'unavailable' : 'loading'
      }
      data-terrain-error={terrainMessage || undefined}
      data-map-resolution={`${mapConfig.width}x${mapConfig.height}`}
      style={{
        position: 'relative',
        width,
        height,
        flexShrink: 0,
        margin: '0 auto',
      }}
    >
      <TiledMapImage
        mapName={mapName}
        label={mapConfig.label || (mapName === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin')}
        hidden={terrainReady}
      />

      {terrainEnabled && (
        <DeepDesertTerrain
          config={mapConfig}
          layout={coriolisLayout}
          zoom={zoom}
          frameRef={frameRef}
          onReady={() => {
            setTerrainError('');
            setTerrainReady(true);
          }}
          onUnavailable={(reason) => {
            setTerrainReady(false);
            setTerrainError(reason);
          }}
        />
      )}

      {isDeepDesert && !terrainReady && (
        <span
          role="status"
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            zIndex: 20,
            padding: '5px 8px',
            color: terrainMessage ? 'var(--theme-soft)' : 'var(--theme-muted)',
            background: 'var(--theme-masthead)',
            border: '1px solid color-mix(in srgb, var(--theme-accent) 35%, transparent)',
            borderRadius: 4,
            fontSize: 10,
            pointerEvents: 'none',
          }}
        >
          {terrainMessage ? `3D terrain unavailable: ${terrainMessage}` : 'Loading 3D terrain…'}
        </span>
      )}

      {!isDeepDesert && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            backgroundImage: `
              linear-gradient(
                color-mix(in srgb, var(--theme-accent) 5%, transparent) 1px,
                transparent 1px
              ),
              linear-gradient(
                90deg,
                color-mix(in srgb, var(--theme-accent) 5%, transparent) 1px,
                transparent 1px
              )
            `,
            backgroundSize: `${gridSize}px ${gridSize}px`,
            zIndex: 2,
          }}
        />
      )}

      {isDeepDesert && showSectorGrid && (
        <SectorGridOverlay
          overlay={gridOverlay}
          width={Number(mapConfig.width)}
          height={Number(mapConfig.height)}
          zoom={zoom}
        />
      )}

      {targetPoint && (
        <span
          style={{
            position: 'absolute',
            left: targetPoint.px * zoom,
            top: targetPoint.py * zoom,
            width: 22,
            height: 22,
            transform: 'translate(-50%, -50%)',
            border: '1px solid var(--theme-muted)',
            borderRadius: '50%',
            boxShadow:
              '0 0 0 4px color-mix(in srgb, var(--theme-accent) 12%, transparent), 0 0 20px color-mix(in srgb, var(--theme-accent) 75%, transparent)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: -8,
              width: 1,
              height: 38,
              background: 'color-mix(in srgb, var(--theme-accent) 70%, transparent)',
              transform: 'translateX(-50%)',
            }}
          />

          <span
            style={{
              position: 'absolute',
              top: '50%',
              left: -8,
              width: 38,
              height: 1,
              background: 'color-mix(in srgb, var(--theme-accent) 70%, transparent)',
              transform: 'translateY(-50%)',
            }}
          />
        </span>
      )}

      {plottedMarkers.map(({ marker, index, point }) => (
        <MapMarker
          key={markerKey(marker, index)}
          marker={marker}
          index={index}
          point={point}
          zoom={zoom}
          onSelect={onSelectMarker}
        />
      ))}
    </div>
  );
}
