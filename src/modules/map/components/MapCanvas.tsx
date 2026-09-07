'use client';

import { useMemo } from 'react';
import Image from 'next/image';

import MapMarker from './MapMarker';

import { worldToMapPoint } from '../utils/coordinates';

import { markerKey } from '../utils/markers';

export default function MapCanvas({
  mapName = 'HaggaBasin',
  mapConfig,
  markers,
  zoom,
  canvasRef,
  target,
  onSelectMarker,
}) {
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
      style={{
        position: 'relative',
        width,
        height,
        flexShrink: 0,
        margin: '0 auto',
      }}
    >
      {/* MAP IMAGE */}

      <Image
        unoptimized
        width={width}
        height={height}
        src={mapName === 'DeepDesert' ? '/maps/deep-desert.png' : '/maps/hagga-basin.png'}
        alt={mapConfig.label || (mapName === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin')}
        draggable={false}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'fill',
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />

      {/* DUNE GRID */}

      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          backgroundImage: `
            linear-gradient(
              rgba(216,167,95,.045) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(216,167,95,.045) 1px,
              transparent 1px
            )
          `,
          backgroundSize: `${gridSize}px ${gridSize}px`,
        }}
      />

      {/* TARGET */}

      {targetPoint && (
        <span
          style={{
            position: 'absolute',
            left: targetPoint.px * zoom,
            top: targetPoint.py * zoom,
            width: 22,
            height: 22,
            transform: 'translate(-50%, -50%)',
            border: '1px solid #d8a75f',
            borderRadius: '50%',
            boxShadow: '0 0 0 4px rgba(216,167,95,.12), 0 0 20px rgba(216,167,95,.75)',
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
              background: 'rgba(216,167,95,.7)',
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
              background: 'rgba(216,167,95,.7)',
              transform: 'translateY(-50%)',
            }}
          />
        </span>
      )}

      {/* MAP MARKERS */}

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
