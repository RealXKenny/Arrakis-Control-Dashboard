import ProgressBar from './ProgressBar';

export default function TelemetryMetric({ label, percent, value, color }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-zinc-500">{label}</span>
        <strong className="text-[11px] font-medium whitespace-nowrap" style={{ color }}>
          {percent === null ? 'N/A' : `${percent.toFixed(0)}%`}
        </strong>
      </div>
      <ProgressBar percent={percent ?? 0} color={color} />
      <div className="mt-2 truncate text-[11px] text-zinc-500" title={String(value)}>
        {value}
      </div>
    </div>
  );
}
