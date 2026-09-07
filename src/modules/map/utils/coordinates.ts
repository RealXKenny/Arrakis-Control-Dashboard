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
