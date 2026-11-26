import { Button } from '../../../components/ui/button';
import styles from '../styles/map.module.css';
import CoriolisCountdown from './coriolis-countdown';

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
        <Button type="button" className={styles.mapButton} aria-label="Zoom out" onClick={onZoomOut}>
          −
        </Button>
        <span className={styles.zoomReading}>{view3D ? '3D' : `${zoomPercent}%`}</span>
        <Button type="button" className={styles.mapButton} aria-label="Zoom in" onClick={onZoomIn}>
          +
        </Button>
      </div>
      <div className={styles.mapActions}>
        <Button
          type="button"
          className={styles.mapButton}
          aria-label={view3D ? '2D map' : '3D map'}
          aria-pressed={view3D}
          onClick={onToggleView}
        >
          {view3D ? '2D' : '3D'}
        </Button>
        <Button type="button" className={styles.mapButton} onClick={onFit}>
          Fit map
        </Button>
        <Button type="button" className={styles.mapButton} onClick={onRefresh}>
          Refresh
        </Button>
      </div>
      <CoriolisCountdown cycleAt={coriolisNextCycleAt} />
    </div>
  );
}
