import { populationSegments, type PopulationHistory } from '../../../../features/portal/population';
import { formatNumber } from '../../../../features/portal/formatting';

const WIDTH = 600;
const HEIGHT = 120;

/** 24-hour online-player line, drawn as plain SVG so it ships no client JavaScript. */
export function PopulationChart({ history }: { history: PopulationHistory | null | undefined }) {
  if (!history || history.points.length < 2) {
    return <p className="text-sm text-sand-500">Population history is still being collected.</p>;
  }
  const peak = Math.max(1, history.peak ?? 1);
  const span = history.to - history.from;
  const x = (at: number) => ((at - history.from) / span) * WIDTH;
  const y = (online: number) => HEIGHT - (online / peak) * (HEIGHT - 8) - 4;

  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Players online over the last 24 hours, peaking at ${history.peak ?? 0}`}
        className="h-32 w-full text-spice-500"
        preserveAspectRatio="none"
      >
        {populationSegments(history).map((segment, index) => (
          <polyline
            key={index}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            points={segment.map((point) => `${x(point.at).toFixed(1)},${y(point.online).toFixed(1)}`).join(' ')}
          />
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-x-8 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
        <span>Peak {formatNumber(history.peak, 0)}</span>
        <span>Play hours {formatNumber(history.playHours, 0)}</span>
        <span>Coverage {formatNumber(history.coverageHours, 1)}h</span>
      </figcaption>
    </figure>
  );
}
