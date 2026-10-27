import { clampPercent } from '../utils/formatting';

export default function ProgressBar({ percent, color }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${clampPercent(percent)}%`, backgroundColor: color }}
      />
    </div>
  );
}
