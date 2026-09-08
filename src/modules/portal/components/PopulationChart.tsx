import { useState } from 'react';
import { populationSegments, type PopulationHistory } from '../utils/population';
import { formatNumber } from '../utils/formatting';
import css from '../overview.module.css';

export default function PopulationChart({
  history,
  totalPlayHours,
}: {
  history: PopulationHistory | null | undefined;
  totalPlayHours?: number | null;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const points = history?.points ?? [];
  const width = 960;
  const bottom = 80;
  const ceiling = Math.max(1, history?.peak ?? 0);
  const x = (at: number) => (history ? 4 + ((at - history.from) / (history.to - history.from)) * (width - 8) : 0);
  const y = (online: number) => bottom - (online / ceiling) * 64;
  const point = selected === null ? null : points[Math.min(selected, points.length - 1)];
  return (
    <div className={`${css.panel} ${css.widePanel}`}>
      <div className={css.chartMetrics}>
        <div>
          <strong>{formatNumber(history?.peak, 0)}</strong>
          <span>Peak online</span>
        </div>
        <div>
          <strong>{formatNumber(totalPlayHours, 1)}</strong>
          <span>Total play-hours</span>
        </div>
      </div>
      {history && points.length > 0 ? (
        <>
          <svg
            className={css.chart}
            viewBox={`0 0 ${width} 90`}
            role="img"
            aria-label="Players online over the last 24 hours. Gaps indicate missing observations."
            preserveAspectRatio="none"
          >
            <line x1="0" y1={bottom} x2={width} y2={bottom} className={css.chartBaseline} />
            {populationSegments(history).map((segment, index) => {
              const coordinates = segment.map((value) => `${x(value.at)},${y(value.online)}`).join(' ');
              return (
                <g key={index}>
                  {segment.length > 1 && (
                    <polygon
                      points={`${x(segment[0].at)},${bottom} ${coordinates} ${x(segment[segment.length - 1].at)},${bottom}`}
                      className={css.chartFill}
                    />
                  )}
                  <polyline points={coordinates} className={css.chartLine} />
                  {segment.length === 1 && (
                    <circle cx={x(segment[0].at)} cy={y(segment[0].online)} r="2" className={css.chartDot} />
                  )}
                </g>
              );
            })}
            {point && <circle cx={x(point.at)} cy={y(point.online)} r="3" className={css.chartDot} />}
          </svg>
          <div className={css.chartAxis}>
            <span>24 hours ago</span>
            <span>12 hours ago</span>
            <span>Now</span>
          </div>
          <label className={css.chartInspect}>
            Inspect readings
            <input
              type="range"
              min={0}
              max={Math.max(0, points.length - 1)}
              value={selected ?? points.length - 1}
              onChange={(event) => setSelected(Number(event.target.value))}
              aria-label="Inspect population history"
            />
            <output>
              {point
                ? `${new Date(point.at).toLocaleTimeString()} · ${point.online} online`
                : `${points.length} observations`}
            </output>
          </label>
        </>
      ) : (
        <div className={css.chartEmpty}>
          {history
            ? 'Collecting population history. The first reading will appear shortly.'
            : 'Population history is unavailable.'}
        </div>
      )}
      <p className={css.chartCaption}>
        Online, last 24h · peak {formatNumber(history?.peak, 0)} · {formatNumber(history?.coverageHours, 1)}h observed.
        Actual accumulated playtime across all reported players.
      </p>
    </div>
  );
}
