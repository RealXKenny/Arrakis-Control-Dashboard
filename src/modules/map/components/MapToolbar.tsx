import styles from '../map.module.css';
import CoriolisCountdown from './CoriolisCountdown';

export default function MapToolbar({
  zoomPercent,
  coriolisNextCycleAt,
  onZoomOut,
  onZoomIn,
  onFit,
  onRefresh,
  view3D,
  onToggleView,
}) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.zoomControls}>
        <button type="button" className={styles.mapButton} aria-label="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <span className={styles.zoomReading}>{view3D ? '3D' : `${zoomPercent}%`}</span>
        <button type="button" className={styles.mapButton} aria-label="Zoom in" onClick={onZoomIn}>
          +
        </button>
      </div>
      <div className={styles.mapActions}>
        <button
          type="button"
          className={styles.mapButton}
          aria-label={view3D ? '2D map' : '3D map'}
          aria-pressed={view3D}
          onClick={onToggleView}
        >
          {view3D ? '2D' : '3D'}
        </button>
        <button type="button" className={styles.mapButton} onClick={onFit}>
          Fit map
        </button>
        <button type="button" className={styles.mapButton} onClick={onRefresh}>
          Refresh
        </button>
      </div>
      <CoriolisCountdown cycleAt={coriolisNextCycleAt} />
    </div>
  );
}
