import { COLORS } from '../config/colors';
import ProgressBar from './ProgressBar';

export default function TelemetryMetric({
  label,
  percent,
  value,
  color,
}) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          marginBottom: 7,
        }}
      >
        <span
          style={{
            color: COLORS.dim,
            fontSize: '0.68rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          {label}
        </span>

        <strong
          style={{
            color,
            fontSize: '0.72rem',
            whiteSpace: 'nowrap',
          }}
        >
          {percent === null
            ? 'N/A'
            : `${percent.toFixed(0)}%`}
        </strong>
      </div>

      <ProgressBar
        percent={percent ?? 0}
        color={color}
      />

      <div
        style={{
          color: COLORS.dim,
          fontSize: '0.68rem',
          marginTop: 6,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  );
}