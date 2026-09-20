import { getCoordinate } from './mapData';

export function worldToMapPoint(marker, map) {
  const x = getCoordinate(marker, 'x');
  const y = getCoordinate(marker, 'y');

  if (!Number.isFinite(x) || !Number.isFinite(y) || !map) {
    return null;
  }

  const width = Number(map.width);
  const height = Number(map.height);
  const minX = Number(map.minX);
  const maxX = Number(map.maxX);
  const minY = Number(map.minY);
  const maxY = Number(map.maxY);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(minX) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxY) ||
    maxX === minX ||
    maxY === minY
  ) {
    return null;
  }

  const normalizedX = (x - minX) / (maxX - minX);

  let normalizedY = (y - minY) / (maxY - minY);

  if (map.flipY) {
    normalizedY = 1 - normalizedY;
  }

  return {
    px: normalizedX * width,
    py: normalizedY * height,
    x,
    y,
    inBounds: normalizedX >= 0 && normalizedX <= 1 && normalizedY >= 0 && normalizedY <= 1,
  };
}

export function mapPixelsToWorld(px, py, map) {
  const width = Number(map?.width);
  const height = Number(map?.height);
  const minX = Number(map?.minX);
  const maxX = Number(map?.maxX);
  const minY = Number(map?.minY);
  const maxY = Number(map?.maxY);

  if (![px, py, width, height, minX, maxX, minY, maxY].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }

  let normalizedY = py / height;
  if (map.flipY) normalizedY = 1 - normalizedY;

  return {
    x: minX + (px / width) * (maxX - minX),
    y: minY + normalizedY * (maxY - minY),
  };
}

export function visibleWorldRect(map, zoom, scrollLeft, scrollTop, viewWidth, viewHeight) {
  if (!Number.isFinite(zoom) || zoom <= 0) return null;

  const first = mapPixelsToWorld(scrollLeft / zoom, scrollTop / zoom, map);
  const second = mapPixelsToWorld((scrollLeft + viewWidth) / zoom, (scrollTop + viewHeight) / zoom, map);
  if (!first || !second) return null;

  // Dev note: two corners walk into a desert; the rectangle is where they meet.
  return {
    minX: Math.min(first.x, second.x),
    maxX: Math.max(first.x, second.x),
    minY: Math.min(first.y, second.y),
    maxY: Math.max(first.y, second.y),
    flipY: Boolean(map.flipY),
  };
}
