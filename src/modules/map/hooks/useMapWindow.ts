import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

export default function useMapWindow(mapConfig, offset = { x: 0, y: 0 }, split = false) {
  const router = useRouter();
  const [windowState, setWindowState] = useState({
    x: 0,
    y: 0,
    width: 1100,
    height: 700,
    minimized: false,
    maximized: false,
  });

  const [windowDrag, setWindowDrag] = useState(null);

  const resizeTerminal = useCallback(() => {
    if (!mapConfig || windowState.maximized) {
      return;
    }

    const mapWidth = Number(mapConfig.width);
    const mapHeight = Number(mapConfig.height);

    if (!Number.isFinite(mapWidth) || !Number.isFinite(mapHeight) || mapWidth <= 0 || mapHeight <= 0) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const horizontalPadding = viewportWidth <= 600 ? 16 : 36;

    const verticalPadding = viewportHeight <= 600 ? 16 : 36;

    const maxWidth = Math.max(
      280,
      split ? (viewportWidth - horizontalPadding - 12) / 2 : viewportWidth - horizontalPadding,
    );

    const maxHeight = Math.max(240, viewportHeight - verticalPadding);

    // Exact old terminal chrome size.
    const chromeHeight = 100;

    const mapRatio = mapWidth / mapHeight;

    let terminalWidth = maxWidth;

    let mapAreaHeight = terminalWidth / mapRatio;

    let terminalHeight = mapAreaHeight + chromeHeight;

    if (terminalHeight > maxHeight) {
      terminalHeight = maxHeight;

      mapAreaHeight = Math.max(140, terminalHeight - chromeHeight);

      terminalWidth = mapAreaHeight * mapRatio;
    }

    terminalWidth = Math.max(280, Math.min(terminalWidth, maxWidth));

    terminalHeight = Math.max(240, Math.min(terminalHeight, maxHeight));

    setWindowState((current) => ({
      ...current,
      width: Math.round(terminalWidth),
      height: Math.round(terminalHeight),
    }));
  }, [mapConfig, windowState.maximized, split]);

  useEffect(() => {
    resizeTerminal();

    window.addEventListener('resize', resizeTerminal);

    return () => {
      window.removeEventListener('resize', resizeTerminal);
    };
  }, [resizeTerminal]);

  useEffect(() => {
    if (windowState.maximized) {
      return;
    }

    const center = () => {
      const horizontalOffset = split ? (offset.x < 0 ? -window.innerWidth / 4 : window.innerWidth / 4) : offset.x;

      setWindowState((current) => ({
        ...current,
        x: Math.max(8, Math.round((window.innerWidth - current.width) / 2) + horizontalOffset),
        y: Math.max(8, Math.round((window.innerHeight - current.height) / 2) + offset.y),
      }));
    };

    center();

    window.addEventListener('resize', center);

    return () => {
      window.removeEventListener('resize', center);
    };
  }, [windowState.width, windowState.height, windowState.maximized, offset.x, offset.y, split]);

  const handleWindowMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) {
        return;
      }

      if (windowState.maximized) {
        return;
      }

      if (event.target.closest('button')) {
        return;
      }

      setWindowDrag({
        startX: event.clientX,
        startY: event.clientY,
        startWindowX: windowState.x,
        startWindowY: windowState.y,
      });
    },
    [windowState.maximized, windowState.x, windowState.y],
  );

  useEffect(() => {
    if (!windowDrag) {
      return;
    }

    const move = (event) => {
      setWindowState((current) => ({
        ...current,
        x: windowDrag.startWindowX + event.clientX - windowDrag.startX,
        y: windowDrag.startWindowY + event.clientY - windowDrag.startY,
      }));
    };

    const up = () => {
      setWindowDrag(null);
    };

    window.addEventListener('mousemove', move);

    window.addEventListener('mouseup', up);

    return () => {
      window.removeEventListener('mousemove', move);

      window.removeEventListener('mouseup', up);
    };
  }, [windowDrag]);

  const minimize = useCallback(() => {
    setWindowState((current) => ({
      ...current,
      minimized: true,
    }));
  }, []);

  const restore = useCallback(() => {
    setWindowState((current) => ({
      ...current,
      minimized: false,
    }));
  }, []);

  const toggleMaximize = useCallback(() => {
    setWindowState((current) => ({
      ...current,
      maximized: !current.maximized,
      minimized: false,
    }));
  }, []);

  const close = useCallback(() => {
    void router.push('/portal');
  }, [router]);

  return {
    windowState,
    setWindowState,
    windowDrag,
    handleWindowMouseDown,
    minimize,
    restore,
    toggleMaximize,
    close,
  };
}
