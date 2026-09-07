'use client';

import styles from '../map.module.css';

export default function MapToolbar({ zoomPercent, onZoomOut, onZoomIn, onFit, onRefresh }) {
  return (
    <div className={styles.toolbar}>
      <span
        style={{
          color: '#d8a75f',
          fontSize: 11,
          marginRight: 4,
        }}
      >
        C:\HAGGA\MAP&gt;
      </span>

      <button type="button" className={styles.terminalButton} onClick={onZoomOut}>
        −
      </button>

      <span
        style={{
          minWidth: 62,
          textAlign: 'center',
          fontSize: 10,
          color: '#d8a75f',
        }}
      >
        ZOOM {zoomPercent}%
      </span>

      <button type="button" className={styles.terminalButton} onClick={onZoomIn}>
        +
      </button>

      <button type="button" className={styles.terminalButton} onClick={onFit}>
        FIT
      </button>

      <button type="button" className={styles.terminalButton} onClick={onRefresh}>
        REFRESH
      </button>

      <span
        className="desktop-hints"
        style={{
          marginLeft: 'auto',
          color: '#6f5b43',
          fontSize: 10,
        }}
      >
        F=FIT&nbsp;&nbsp; R=REFRESH&nbsp;&nbsp; +/-=ZOOM&nbsp;&nbsp; ESC=CLOSE
      </span>
    </div>
  );
}
