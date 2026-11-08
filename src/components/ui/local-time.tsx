'use client';

import { useSyncExternalStore } from 'react';
import { formatTimestamp, formatUtc, localTimeZone, parseTimestamp, type TimeVariant } from '../../lib/time';

const subscribe = () => () => {};
// Server and hydration render share this snapshot, so markup matches; the browser zone swaps in after.
const getServerZone = () => '';
const getClientZone = () => localTimeZone();

/**
 * An absolute timestamp shown in the viewer's own timezone and locale. The server (and the first
 * hydration pass) render UTC with an explicit "UTC" label, so there is never a mismatch or a
 * wrong-zone guess; the tooltip always carries the full local and UTC readings.
 */
export function LocalTime({
  value,
  variant = 'datetime',
  className,
}: {
  value: string | number | Date | null | undefined;
  variant?: TimeVariant;
  className?: string;
}) {
  const zone = useSyncExternalStore(subscribe, getClientZone, getServerZone);
  const date = parseTimestamp(value);
  if (!date) return <span className={className}>—</span>;

  const hydrated = zone !== '';
  const text = hydrated
    ? formatTimestamp(date, { variant })
    : formatTimestamp(date, { variant, timeZone: 'UTC', locale: 'en-US' });
  const title = hydrated
    ? `${formatTimestamp(date, { variant: 'datetime' })} · ${zone} · ${formatUtc(date)}`
    : formatUtc(date);
  return (
    <time dateTime={date.toISOString()} title={title} className={className}>
      {text}
    </time>
  );
}
