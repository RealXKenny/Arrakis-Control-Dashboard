"use client";

function friendlyMarkerType(type) {
  return (
    {
      player: "Player",
      vehicle: "Vehicle",
      base: "Base",
      spice: "Static Spice Spawns",
      spice_active: "Active Spice Blows",
      flour_sand: "Flour Sand",
      poi: "POI's",
      house_representative: "House Representative",
      trainer: "Trainer",
    }[String(type || "").toLowerCase()] || "Marker"
  );
}

function getMarkerName(marker, index) {
  const type = String(marker?.type || "")
    .trim()
    .toLowerCase();

  if (type === "vehicle" && marker?.subtype) {
    return String(marker.subtype)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();
  }

  if (type === "house_representative" && marker?.subtype) {
    return String(marker.subtype)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();
  }

  return marker?.name || marker?.label || marker?.id || `${friendlyMarkerType(type)} ${index + 1}`;
}

function getMarkerClass(marker) {
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

export default function MapMarker({ marker, index, point, zoom, onSelect }) {
  const type = String(marker?.type || "marker")
    .trim()
    .toLowerCase();

  const name = getMarkerName(marker, index);

  const markerClass = getMarkerClass(marker);

  return (
    <button
      type="button"
      className={`${markerClass} hag-map-marker`}
      data-online={marker?.online === false ? "false" : "true"}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(marker);
      }}
      title={`${friendlyMarkerType(type)}: ${name} — X: ${point.x.toFixed(0)}, Y: ${point.y.toFixed(0)}`}
      aria-label={`${friendlyMarkerType(type)}: ${name}`}
      style={{
        position: "absolute",
        left: point.px * zoom,
        top: point.py * zoom,
        transform: "translate(-50%, -50%)",
        padding: 0,
        margin: 0,
        border: 0,
        outline: "none",
        backgroundColor: "transparent",
        color: "inherit",
        cursor: "pointer",
        appearance: "none",
        font: "inherit",
        zIndex: 5,
      }}
    >
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "calc(100% + 3px)",
          transform: "translateX(-50%)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          fontSize: 10,
          lineHeight: 1.1,
          color: "#f2dfbd",
          background: "rgba(8, 6, 4, 0.88)",
          border: "1px solid rgba(216, 167, 95, 0.45)",
          padding: "2px 5px",
          borderRadius: 1,
          textShadow: "0 1px 2px #000",
          zIndex: 20,
        }}
      >
        {name}
      </span>
    </button>
  );
}
