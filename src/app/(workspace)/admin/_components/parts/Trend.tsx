import { ui } from '../ui';

/** Dependency-free sparkline for session-local readings; `null` values leave gaps. */
export function Trend({ values, label }: { values: (number | null)[]; label: string }) {
  const maximum = Math.max(1, ...values.filter((value): value is number => value !== null));
  const points = values
    .map((value, index) =>
      value === null ? null : `${(index / Math.max(values.length - 1, 1)) * 400},${90 - (value / maximum) * 75}`,
    )
    .filter(Boolean)
    .join(' ');
  return (
    <article className={ui.trend}>
      <h3>{label}</h3>
      {values.filter((value) => value !== null).length < 2 ? (
        <p>Collecting readings. Trends appear after the next refresh.</p>
      ) : (
        <svg viewBox="0 0 400 100" role="img" aria-label={label}>
          <path d="M0 90H400" className="stroke-sand-200/20" />
          <polyline points={points} className="stroke-spice-400" strokeWidth="2" fill="none" />
        </svg>
      )}
      <small>
        Last {values.length} reading{values.length === 1 ? '' : 's'} in this session · refreshes every 30 seconds
      </small>
    </article>
  );
}
