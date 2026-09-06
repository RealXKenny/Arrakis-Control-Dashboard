import { friendlyMarkerType } from "../config/markerConfig";

export function getMarkerName(marker, index) {
  const type = String(marker?.type || "")
    .trim()
    .toLowerCase();

  if (type === "house_representative" && marker?.subtype) {
    return String(marker.subtype)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();
  }

  return marker?.name || marker?.label || marker?.id || `${friendlyMarkerType(type)} ${index + 1}`;
}

export function getMarkerClass(marker) {
  const type = String(marker?.type || "marker")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  const subtype = String(marker?.subtype || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");

  const classes = ["live-map-marker", `marker-${type || "marker"}`];

  if (subtype) {
    classes.push(`subtype-${subtype}`);
  }

  if ((type === "spice" || type === "spice_active") && subtype) {
    classes.push(`spice-size-${subtype}`);
  }

  return classes.join(" ");
}

export function markerKey(marker, index) {
  return String(`${marker?.type || "marker"}-${marker?.id ?? marker?.base_id ?? index}-${index}`);
}
