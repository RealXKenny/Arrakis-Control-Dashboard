import { MAX_ZOOM } from "../config/mapConfig";

export function clampZoom(value, minimum) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.max(minimum, Math.min(MAX_ZOOM, value));
}
