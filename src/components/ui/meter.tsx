import { clampPercent } from '../../lib/format';

/**
 * Flat gauge. Default tone is Spice and turns danger-red at or below 25%.
 * `fullIsBad` flips the warning for things that hurt when they fill up (storage), and `tone="water"`
 * uses the cool blue for liquids.
 */
export function Meter({
  label,
  percent,
  value,
  tone = 'spice',
  fullIsBad = false,
}: {
  label: string;
  percent: number | null;
  value: string;
  tone?: 'spice' | 'water';
  fullIsBad?: boolean;
}) {
  const known = percent !== null;
  const clamped = known ? clampPercent(percent) : 0;
  const warn = known && (fullIsBad ? clamped >= 90 : clamped <= 25);
  const color = warn ? 'bg-status-danger' : tone === 'water' ? 'bg-ibad-400' : 'bg-spice-500';
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{label}</span>
        <span className="truncate font-mono text-xs font-semibold text-sand-100" title={value}>
          {value}
        </span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? Math.round(clamped) : undefined}
        aria-valuetext={value}
        className="h-1.5 w-full bg-sand-200/10"
      >
        <div className={`h-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
