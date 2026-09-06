import { styles } from '../config/colors';
import { clampPercent } from '../utils/formatting';

export default function ProgressBar({ percent, color }) {
  return (
    <div style={styles.progressTrack}>
      <div
        style={{
          width: `${clampPercent(percent)}%`,
          height: '100%',
          borderRadius: 999,
          backgroundColor: color,
          transition: 'width 0.5s ease',
          boxShadow: `0 0 8px ${color}`,
        }}
      />
    </div>
  );
}