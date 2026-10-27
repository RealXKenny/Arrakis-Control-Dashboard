'use client';
import styles from '../map.module.css';

function friendlyMarkerType(type) {
  return (
    {
      player: 'Player',
      vehicle: 'Vehicle',
      base: 'Base',
      spice: 'Static Spice Spawns',
      spice_active: 'Active Spice Blows',
      flour_sand: 'Flour Sand',
      poi: 'Point of interest',
      house_representative: 'House Representative',
      trainer: 'Trainer',
      worm: 'Sandworm',
      realtime_npc: 'NPC',
      civilian: 'Civilian',
      storm: 'Sandstorm',
      coriolis: 'Coriolis',
    }[String(type || '').toLowerCase()] || 'Marker'
  );
}

export default function MarkerDetails({ marker, onClose, onFlyTo }) {
  if (!marker) return null;
  const type = String(marker.type || '').toLowerCase();
  const name = String(marker.name || marker.label || marker.subtype || marker.id || 'Location');
  const coordinates = ['x', 'y', 'z'].filter((axis) => marker[axis] != null && Number.isFinite(Number(marker[axis])));
  return (
    <section className={styles.markerDetails} aria-label="Location details">
      <header>
        <span>{friendlyMarkerType(type)}</span>
        <button type="button" onClick={onClose} aria-label="Close location details">
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path d="m5 5 10 10M15 5 5 15" />
          </svg>
        </button>
      </header>
      <h2>{name}</h2>
      <div className={styles.detailTags}>
        {marker.realtime && <span>Live · Instance {marker.partition}</span>}
        {marker.subtype && <span>{String(marker.subtype).replace(/_/g, ' ')}</span>}
        {marker.sector && <span>Sector {String(marker.sector)}</span>}
      </div>
      {coordinates.length > 0 && (
        <dl>
          {coordinates.map((axis) => (
            <div key={axis}>
              <dt>{axis.toUpperCase()}</dt>
              <dd>{Number(marker[axis]).toFixed(0)}</dd>
            </div>
          ))}
        </dl>
      )}
      {onFlyTo && (
        <button type="button" className={styles.detailFlyTo} onClick={onFlyTo}>
          Fly to <span aria-hidden="true">↗</span>
        </button>
      )}
    </section>
  );
}
