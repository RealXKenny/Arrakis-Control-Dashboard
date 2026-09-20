'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { visibleWorldRect } from '../utils/coordinates';
import { createDeepDesertRenderer, type DeepDesertRenderer } from './renderer';
import { loadLayoutAssets, loadSharedAssets } from './terrainAssets';
import { probeTerrainSupport } from './terrainSupport';
type MapConfig = {
  width: number;
  height: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  flipY?: boolean;
};
export type DeepDesertTerrainProps = {
  config: MapConfig;
  layout: number;
  zoom: number;
  frameRef: React.RefObject<HTMLDivElement | null>;
  onUnavailable: (reason: string) => void;
  createRenderer?: typeof createDeepDesertRenderer;
  probeSupport?: typeof probeTerrainSupport;
  onReady?: () => void;
};
export default function DeepDesertTerrain({
  config,
  layout,
  zoom,
  frameRef,
  onUnavailable,
  onReady,
  createRenderer = createDeepDesertRenderer,
  probeSupport = probeTerrainSupport,
}: DeepDesertTerrainProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<DeepDesertRenderer | null>(null);
  const frameCallback = useRef(0);
  const [ready, setReady] = useState(false);
  const callbacks = useRef({ onUnavailable, onReady, createRenderer, probeSupport });
  useLayoutEffect(() => {
    callbacks.current = { onUnavailable, onReady, createRenderer, probeSupport };
  }, [onUnavailable, onReady, createRenderer, probeSupport]);
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { onUnavailable: report, createRenderer: create, probeSupport: probe } = callbacks.current;
    const support = probe();
    if (!support.supported) {
      // Dev note: no GPU left behind; the flat map still knows the lay of the sand.
      report('reason' in support ? support.reason : 'terrain rendering is unavailable');
      return;
    }
    let renderer: DeepDesertRenderer;
    try {
      renderer = create(canvas, {
        onContextLost: () => callbacks.current.onUnavailable('graphics context lost'),
      });
    } catch (error) {
      report(error instanceof Error ? error.message : String(error));
      return;
    }
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setReady(false);
    (async () => {
      try {
        const [shared, assets] = await Promise.all([
          loadSharedAssets(undefined, controller.signal),
          loadLayoutAssets(layout, undefined, controller.signal),
        ]);
        if (controller.signal.aborted) return;
        const renderer = rendererRef.current;
        if (!renderer) return;
        renderer.setAssets(shared, assets);
        // Dev note: the dunes have rendered. Their union representative demanded depth.
        setReady(true);
        callbacks.current.onReady?.();
      } catch (error) {
        if (controller.signal.aborted) return;
        callbacks.current.onUnavailable(error instanceof Error ? error.message : String(error));
      }
    })();
    return () => controller.abort();
  }, [layout]);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!frame || !canvas || !renderer || !ready) return;
    const paint = () => {
      frameCallback.current = 0;
      const mapWidth = Math.floor(config.width * zoom);
      const mapHeight = Math.floor(config.height * zoom);
      const width = Math.min(frame.clientWidth, mapWidth);
      const height = Math.min(frame.clientHeight, mapHeight);
      if (width <= 0 || height <= 0) return;
      const left = Math.min(Math.max(frame.scrollLeft, 0), Math.max(0, mapWidth - width));
      const top = Math.min(Math.max(frame.scrollTop, 0), Math.max(0, mapHeight - height));
      canvas.style.transform = `translate(${left}px, ${top}px)`;
      renderer.resize(width, height, window.devicePixelRatio || 1);
      const rect = visibleWorldRect(config, zoom, left, top, width, height);
      if (!rect) return;
      renderer.setView(rect);
      renderer.draw();
    };
    const schedule = () => {
      if (frameCallback.current) return;
      // Dev note: one frame at a time keeps the sand from getting everywhere.
      frameCallback.current = requestAnimationFrame(paint);
    };
    paint();
    frame.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    return () => {
      frame.removeEventListener('scroll', schedule);
      observer.disconnect();
      if (frameCallback.current) cancelAnimationFrame(frameCallback.current);
      frameCallback.current = 0;
    };
  }, [config, zoom, ready, frameRef]);
  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-terrain-resolution={`${config.width}x${config.height}`}
      style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none' }}
    />
  );
}
