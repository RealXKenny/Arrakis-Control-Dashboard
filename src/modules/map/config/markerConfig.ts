export function friendlyMarkerType(type) {
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
