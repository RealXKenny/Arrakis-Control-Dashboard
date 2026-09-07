'use client';

function friendlyMarkerType(type) {
  return (
    {
      player: 'Player',
      vehicle: 'Vehicle',
      base: 'Base',
      spice: 'Static Spice Spawns',
      spice_active: 'Active Spice Blows',
      flour_sand: 'Flour Sand',
      poi: "POI's",
      house_representative: 'House Representative',
      trainer: 'Trainer',
    }[String(type || '').toLowerCase()] || 'Marker'
  );
}

export default function MarkerDetails({ marker, onClose }) {
  if (!marker) {
    return null;
  }

  const type = String(marker.type || '').toLowerCase();

  const name = marker.name || marker.label || marker.subtype || marker.id || 'Marker';

  return (
    <div
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        width: 280,
        padding: 12,
        background: 'rgba(8, 6, 4, 0.94)',
        border: '1px solid rgba(216, 167, 95, 0.55)',
        color: '#e5d2b3',
        zIndex: 50,
        fontSize: 11,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <strong
          style={{
            color: '#d8a75f',
          }}
        >
          {friendlyMarkerType(type)}
        </strong>

        <button type="button" onClick={onClose}>
          ×
        </button>
      </div>

      <div>{name}</div>

      {marker.subtype && <div>Subtype: {marker.subtype}</div>}

      {marker.x != null && <div>X: {Number(marker.x).toFixed(0)}</div>}

      {marker.y != null && <div>Y: {Number(marker.y).toFixed(0)}</div>}

      {marker.z != null && <div>Z: {Number(marker.z).toFixed(0)}</div>}
    </div>
  );
}
