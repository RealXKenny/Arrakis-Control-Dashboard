'use client';

import styles from '../map.module.css';

export default function MapStatusBar({ loading, error, markerCount, zoomPercent, target }) {
  return (
    <div className={styles.mapStatusBar}>
      <span
        className={styles.mapReadingState}
        data-loading={loading ? 'true' : 'false'}
        data-error={error ? 'true' : 'false'}
      >
        {loading ? 'Updating map…' : error ? 'Reading unavailable' : 'Latest map reading'}
      </span>

      <span className={styles.mapStatusMetric}>
        <strong>{markerCount}</strong> visible markers
      </span>

      <span className={styles.mapStatusMetric}>
        <strong>{zoomPercent}%</strong> zoom
      </span>

      {target && (
        <span>
          TARGET: X {Number(target.x).toFixed(0)} Y {Number(target.y).toFixed(0)}
        </span>
      )}
    </div>
  );
}
