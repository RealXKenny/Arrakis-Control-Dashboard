'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const DEFAULT_ZOOM = 0.1;
const MAX_ZOOM = 2;

function clampZoom(value, minimum) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.min(MAX_ZOOM, value));
}

export default function useMapZoom({ mapConfig, frameRef, canvasRef }) {
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const zoomAnchorRef = useRef(null);

  const getMinimumZoom = useCallback(() => {
    const frame = frameRef.current;

    if (!frame || !mapConfig) {
      return DEFAULT_ZOOM;
    }

    const width = Number(mapConfig.width);
    const height = Number(mapConfig.height);

    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      return DEFAULT_ZOOM;
    }

    const horizontal = frame.clientWidth / width;

    const vertical = frame.clientHeight / height;

    return Math.min(1, Math.max(DEFAULT_ZOOM, Math.min(horizontal, vertical)));
  }, [frameRef, mapConfig]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !mapConfig) return;
    // Recalculate the minimum when the responsive map frame changes size.
    const resize = () => setZoom((current) => clampZoom(current, getMinimumZoom()));
    const observer = new ResizeObserver(resize);
    observer.observe(frame);
    resize();
    return () => observer.disconnect();
  }, [frameRef, mapConfig, getMinimumZoom]);

  const setZoomAround = useCallback(
    (nextZoom, point = null) => {
      const frame = frameRef.current;
      const canvas = canvasRef.current;

      const minimum = getMinimumZoom();

      const next = clampZoom(nextZoom, minimum);

      if (frame && canvas && point) {
        const rect = frame.getBoundingClientRect();

        const viewportX = point.clientX - rect.left;

        const viewportY = point.clientY - rect.top;

        const mapX = (frame.scrollLeft + viewportX) / zoom;

        const mapY = (frame.scrollTop + viewportY) / zoom;

        zoomAnchorRef.current = {
          mapX,
          mapY,
          viewportX,
          viewportY,
        };
      } else {
        zoomAnchorRef.current = null;
      }

      setZoom(next);
    },
    [canvasRef, frameRef, getMinimumZoom, zoom],
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const anchor = zoomAnchorRef.current;

    if (!frame || !anchor) {
      return;
    }

    frame.scrollLeft = anchor.mapX * zoom - anchor.viewportX;

    frame.scrollTop = anchor.mapY * zoom - anchor.viewportY;

    zoomAnchorRef.current = null;
  }, [frameRef, zoom]);

  useEffect(() => {
    const frame = frameRef.current;

    if (!frame) {
      return;
    }

    const handleWheel = (event) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        return;
      }

      const rect = canvas.getBoundingClientRect();

      const inside =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!inside) {
        return;
      }

      event.preventDefault();

      setZoomAround(zoom * (event.deltaY < 0 ? 1.12 : 0.88), {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    };

    frame.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      frame.removeEventListener('wheel', handleWheel);
    };
  }, [canvasRef, frameRef, setZoomAround, zoom]);

  const fitMap = useCallback(() => {
    const frame = frameRef.current;

    if (!frame || !mapConfig) {
      return;
    }

    const next = getMinimumZoom();

    zoomAnchorRef.current = null;

    setZoom(next);

    requestAnimationFrame(() => {
      const currentFrame = frameRef.current;

      if (!currentFrame) {
        return;
      }

      const width = Number(mapConfig.width) * next;

      const height = Number(mapConfig.height) * next;

      currentFrame.scrollLeft = Math.max(0, (width - currentFrame.clientWidth) / 2);

      currentFrame.scrollTop = Math.max(0, (height - currentFrame.clientHeight) / 2);
    });
  }, [frameRef, getMinimumZoom, mapConfig]);

  return {
    zoom,
    setZoom,
    setZoomAround,
    fitMap,
    getMinimumZoom,
    zoomPercent: Math.round(zoom * 100),
  };
}
