import type { WaterAnalysis, WaterSample } from '../care';

const W = 600;
const H = 160;
const PAD = 28;

/** N028: observed samples only. Gaps and unknown readings break the line instead of being interpolated. */
export function WaterChart({
  name,
  samples,
  analysis,
  threshold,
}: {
  name: string;
  samples: WaterSample[];
  analysis: WaterAnalysis;
  threshold: number;
}) {
  const times = samples.map((sample) => Date.parse(sample.t));
  const start = Math.min(...times);
  const end = Math.max(...times);
  const span = Math.max(end - start, 1);
  const x = (t: string) => PAD + ((Date.parse(t) - start) / span) * (W - PAD * 2);
  const y = (percent: number) => H - PAD - (percent / 100) * (H - PAD * 2);
  const summary =
    analysis.usagePerHour === null
      ? 'Not enough continuous samples to estimate usage.'
      : `Observed average decline about ${analysis.usagePerHour.toFixed(2)} percentage points per hour (uncertain estimate).`;
  return (
    <figure className="mt-3 min-w-0">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full border border-sand-200/15 bg-obsidian-900"
        role="img"
        aria-label={`Observed water level for ${name}: ${samples.length} samples, ${analysis.gaps.length} sampling gap(s). ${summary}`}
      >
        {[0, 50, 100].map((value) => (
          <g key={value}>
            <line x1={PAD} x2={W - PAD} y1={y(value)} y2={y(value)} className="stroke-sand-200/15" />
            <text x={4} y={y(value) + 4} className="fill-sand-400 font-mono text-[10px]">
              {value}%
            </text>
          </g>
        ))}
        <line
          x1={PAD}
          x2={W - PAD}
          y1={y(threshold)}
          y2={y(threshold)}
          strokeDasharray="6 4"
          className="stroke-status-warn"
        />
        {analysis.gaps.map((gap) => (
          <rect
            key={gap.from}
            x={x(gap.from)}
            y={PAD}
            width={Math.max(2, x(gap.to) - x(gap.from))}
            height={H - PAD * 2}
            className="fill-sand-200/10"
          >
            <title>{`No samples for ${gap.hours.toFixed(1)} hours`}</title>
          </rect>
        ))}
        {analysis.segments.map((segment) =>
          segment.length > 1 ? (
            <polyline
              key={segment[0].t}
              fill="none"
              strokeWidth={2}
              className="stroke-ibad-400"
              points={segment.map((sample) => `${x(sample.t)},${y(sample.percent ?? 0)}`).join(' ')}
            />
          ) : (
            <circle
              key={segment[0].t}
              cx={x(segment[0].t)}
              cy={y(segment[0].percent ?? 0)}
              r={3}
              className="fill-ibad-400"
            />
          ),
        )}
        {samples
          .filter((sample) => sample.percent === null)
          .map((sample) => (
            <text key={sample.t} x={x(sample.t) - 3} y={H - 8} className="fill-status-warn font-mono text-[10px]">
              ?
            </text>
          ))}
      </svg>
      <figcaption className="mt-2 text-xs leading-relaxed text-sand-400">
        {samples.length} observed sample(s) from your visits in the last seven days. Shaded bands are gaps over two
        hours; ? marks unknown readings; the dashed line is your alert level. {summary}
        {analysis.refills > 0 && ` ${analysis.refills} refill(s) were excluded from usage.`}
        {analysis.projectedThresholdAt &&
          ` If that rate held, the alert level could be reached around ${new Date(analysis.projectedThresholdAt).toLocaleString()} — an uncertain projection, not a reading.`}
      </figcaption>
    </figure>
  );
}
