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

export function getMarkerArray(data) {
  if (Array.isArray(data?.markers)) {
    return data.markers;
  }

  if (Array.isArray(data)) {
    return data;
  }

  return [];
}

export function getMapConfig(data) {
  if (data?.map) {
    return data.map;
  }

  if (data?.maps && data?.defaultMap && data.maps[data.defaultMap]) {
    return data.maps[data.defaultMap];
  }

  if (data?.maps) {
    const firstMap = Object.values(data.maps)[0];

    if (firstMap) {
      return firstMap;
    }
  }

  if (data?.config) {
    return data.config;
  }

  return null;
}
