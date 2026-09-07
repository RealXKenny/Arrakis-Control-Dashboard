'use client';

export default function MapStatusBar({ loading, error, markerCount, zoomPercent, target }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
        padding: '4px 8px',
        minHeight: 24,
        borderTop: '1px solid rgba(216, 167, 95, 0.25)',
        color: '#bda987',
        fontSize: 10,
      }}
    >
      <span>{loading ? 'Updating map…' : error ? 'Reading unavailable' : 'Latest map reading'}</span>

      <span>{markerCount} visible markers</span>

      <span>{zoomPercent}% zoom</span>

      {target && (
        <span>
          TARGET: X {Number(target.x).toFixed(0)} Y {Number(target.y).toFixed(0)}
        </span>
      )}
    </div>
  );
}
