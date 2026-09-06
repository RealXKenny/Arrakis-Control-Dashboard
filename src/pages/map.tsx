"use client";

import React from "react";

import MapWindow from "../modules/map/components/MapWindow";

export default function HaggaBasinMap() {
  const [mapName, setMapName] = React.useState("HaggaBasin");

  return <MapWindow mapName={mapName} title={mapName === "DeepDesert" ? "DEEP DESERT" : "HAGGA BASIN"} onMapChange={setMapName} />;
}
