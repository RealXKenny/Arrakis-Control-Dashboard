import styles from '../map.module.css';
import CoriolisCountdown from './CoriolisCountdown';

export default function MapToolbar({ zoomPercent, coriolisNextCycleAt, onZoomOut, onZoomIn, onFit, onRefresh }) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.zoomControls}>
        <button type="button" className={styles.mapButton} aria-label="Zoom out" onClick={onZoomOut}>
          −
        </button>
        <span className={styles.zoomReading}>{zoomPercent}%</span>
        <button type="button" className={styles.mapButton} aria-label="Zoom in" onClick={onZoomIn}>
          +
        </button>
      </div>
      <div className={styles.mapActions}>
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
