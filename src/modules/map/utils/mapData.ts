export function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

export function getCoordinate(marker, axis) {
  if (!marker || typeof marker !== "object") {
    return NaN;
  }

  const value = axis === "x" ? (marker.x ?? marker.pos_x ?? marker.longitude ?? marker.position?.x ?? marker.coordinates?.x) : (marker.y ?? marker.pos_y ?? marker.latitude ?? marker.position?.y ?? marker.coordinates?.y);

  return toNumber(value);
}
