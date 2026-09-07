import styles from '../map.module.css';
export default function MapToolbar({ zoomPercent, onZoomOut, onZoomIn, onFit, onRefresh }) {
  return (
    <div className={styles.toolbar}>
      <button type="button" className={styles.mapButton} aria-label="Zoom out" onClick={onZoomOut}>
        −
      </button>
      <span>{zoomPercent}%</span>
      <button type="button" className={styles.mapButton} aria-label="Zoom in" onClick={onZoomIn}>
        +
      </button>
      <button type="button" className={styles.mapButton} onClick={onFit}>
        Fit map
      </button>
      <button type="button" className={styles.mapButton} onClick={onRefresh}>
        Refresh
      </button>
    </div>
  );
}
