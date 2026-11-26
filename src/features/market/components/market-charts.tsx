'use client';
import { useEffect, useState } from 'react';
import { formatDecimal } from '../../../lib/format';
import { priceSegments, type ActivityBucket, type PricePoint } from '../planner';
import { errorText, formatTime, plannerFetch } from './planner-request';

const WIDTH = 600;
const HEIGHT = 160;
const PAD = 8;

/** Plotting only: exact values are always shown as decimal strings in labels and the table view. */
const plotValue = (value: string) => Number(BigInt(value));

/**
 * Observed lowest asks (N043). Points exist only where the dashboard read the ladder; long gaps break the line and
 * are never interpolated. This is not a full exchange price history.
 */
export function PriceHistory({ templateId, grade, name }: { templateId: string; grade: number | null; name: string }) {
  const [state, setState] = useState<
    | { status: 'loading' }
    | { status: 'error'; message: string }
    | { status: 'ok'; points: PricePoint[]; rejected: number; sampleIntervalMs: number }
  >({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      templateId,
      grade: grade === null || grade === undefined ? '' : String(grade),
    });
    plannerFetch<{ points: PricePoint[]; rejected: number; sampleIntervalMs: number }>(
      `/api/v2/market/planner/prices?${params}`,
      { signal: controller.signal },
    )
      .then((value) => {
        if (!controller.signal.aborted) setState({ status: 'ok', ...value });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setState({ status: 'error', message: errorText(error, 'Observed prices are unavailable.') });
      });
    return () => controller.abort();
  }, [templateId, grade]);

  if (state.status === 'loading') return <p className="text-sm text-sand-400">Loading observed prices…</p>;
  if (state.status === 'error') return <p className="text-sm text-sand-400">{state.message}</p>;
  const priced = state.points.filter((point) => point.lowest !== null && point.lowest !== undefined);
  if (priced.length < 2)
    return (
      <p className="text-sm text-sand-400">
        Not enough observations yet for {name}. The dashboard records at most one reading every{' '}
        {Math.round(state.sampleIntervalMs / 60_000)} minutes, only when a member views this item.
      </p>
    );
  const gap = Math.max(state.sampleIntervalMs * 18, 6 * 3_600_000);
  const segments = priceSegments(priced, gap);
  const times = priced.map((point) => Date.parse(point.at));
  const values = priced.map((point) => plotValue(point.lowest!));
  const [from, to] = [Math.min(...times), Math.max(...times)];
  const [low, high] = [Math.min(...values), Math.max(...values)];
  const x = (at: number) => PAD + ((at - from) / Math.max(1, to - from)) * (WIDTH - PAD * 2);
  const y = (value: number) => HEIGHT - PAD - ((value - low) / Math.max(1, high - low)) * (HEIGHT - PAD * 2);
  const latest = priced[priced.length - 1]!;
  const exact = priced.map((point) => BigInt(point.lowest!));
  const lowExact = exact.reduce((min, value) => (value < min ? value : min)).toString();
  const highExact = exact.reduce((max, value) => (value > max ? value : max)).toString();
  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Observed lowest ask for ${name}: ${priced.length} readings from ${formatTime(priced[0]!.at)} to ${formatTime(latest.at)}`}
        className="h-40 w-full text-spice-500"
      >
        <line x1={PAD} x2={WIDTH - PAD} y1={HEIGHT - PAD} y2={HEIGHT - PAD} className="stroke-sand-200/20" />
        {segments.map((segment, index) => (
          <polyline
            key={index}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            points={segment
              .map((point) => `${x(Date.parse(point.at)).toFixed(1)},${y(plotValue(point.lowest!)).toFixed(1)}`)
              .join(' ')}
          />
        ))}
        {priced.map((point) => (
          <circle
            key={point.at}
            cx={x(Date.parse(point.at))}
            cy={y(plotValue(point.lowest!))}
            r={4}
            className="fill-spice-400 stroke-obsidian-950"
            strokeWidth={2}
          >
            <title>{`${formatTime(point.at)}: ${formatDecimal(point.lowest)} Solaris, ${formatDecimal(point.stock)} units listed`}</title>
          </circle>
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
        <span>Latest {formatDecimal(latest.lowest)}</span>
        <span>
          Range {formatDecimal(lowExact)}–{formatDecimal(highExact)}
        </span>
        <span>{priced.length} readings</span>
        {segments.length > 1 && <span>{segments.length - 1} sampling gaps</span>}
        {state.rejected > 0 && <span>{state.rejected} unreadable readings skipped</span>}
      </figcaption>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-sand-300">Table view</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="text-sand-500">
                <th className="py-1 pr-3 font-normal">Observed</th>
                <th className="py-1 pr-3 font-normal">Lowest ask</th>
                <th className="py-1 font-normal">Units listed</th>
              </tr>
            </thead>
            <tbody>
              {[...state.points].reverse().map((point) => (
                <tr key={point.at}>
                  <td className="py-1 pr-3">{formatTime(point.at)}</td>
                  <td className="py-1 pr-3">{formatDecimal(point.lowest ?? null)}</td>
                  <td className="py-1">{formatDecimal(point.stock)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Completed trades per bucket (N044). One series, so the title names it and no legend is needed. */
export function ActivityChart({ buckets, hours }: { buckets: ActivityBucket[]; hours: number }) {
  const peak = Math.max(1, ...buckets.map((bucket) => bucket.trades));
  const slot = (WIDTH - PAD * 2) / Math.max(1, buckets.length);
  const bar = Math.max(2, slot - 2);
  const label = (start: string) =>
    new Date(start).toLocaleString(undefined, hours <= 24 ? { hour: 'numeric' } : { month: 'short', day: 'numeric' });
  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Completed orders per ${hours <= 24 ? 'hour' : 'day'}, peaking at ${peak}`}
        className="h-40 w-full"
      >
        <line x1={PAD} x2={WIDTH - PAD} y1={HEIGHT - PAD} y2={HEIGHT - PAD} className="stroke-sand-200/20" />
        {buckets.map((bucket, index) => {
          const height = (bucket.trades / peak) * (HEIGHT - PAD * 2);
          return (
            <rect
              key={bucket.start}
              x={PAD + index * slot + 1}
              y={HEIGHT - PAD - height}
              width={bar}
              height={Math.max(0, height)}
              rx={Math.min(4, bar / 2)}
              className="fill-spice-500"
            >
              <title>{`${label(bucket.start)}: ${bucket.trades} orders, ${formatDecimal(bucket.units)} units, ${formatDecimal(bucket.value)} Solaris`}</title>
            </rect>
          );
        })}
      </svg>
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-sand-300">Table view</summary>
        <div className="mt-2 max-h-60 overflow-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="text-sand-500">
                <th className="py-1 pr-3 font-normal">Period</th>
                <th className="py-1 pr-3 font-normal">Orders</th>
                <th className="py-1 pr-3 font-normal">Units</th>
                <th className="py-1 font-normal">Value</th>
              </tr>
            </thead>
            <tbody>
              {buckets.map((bucket) => (
                <tr key={bucket.start}>
                  <td className="py-1 pr-3">{label(bucket.start)}</td>
                  <td className="py-1 pr-3">{bucket.trades}</td>
                  <td className="py-1 pr-3">{formatDecimal(bucket.units)}</td>
                  <td className="py-1">
                    {formatDecimal(bucket.value)}
                    {bucket.incomplete > 0 && ` (${bucket.incomplete} without totals)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
