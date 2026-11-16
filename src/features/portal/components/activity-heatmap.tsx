'use client';

import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { activityByLocalHour, type PopulationPoint } from '../population';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ActivityHeatmap({ points }: { points: PopulationPoint[] }) {
  const [day, setDay] = useState(0);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(0);
  useEffect(() => {
    setDay(new Date().getDay());
    setNow(Date.now());
    setReady(true);
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  if (!ready) return <p className="text-sm text-sand-500">Preparing local-time activity…</p>;
  if (!points.length) return <p className="text-sm text-sand-500">No population observations are available yet.</p>;
  const cells = activityByLocalHour(points);
  const highest = Math.max(1, ...cells.map((cell) => cell.average ?? 0));
  const latest = Math.max(...points.map((point) => point.at));
  const age = now - latest;
  const observed = cells
    .slice(day * 24, day * 24 + 24)
    .map((cell, hour) => ({ ...cell, hour }))
    .filter((cell): cell is { samples: number; average: number; hour: number } => cell.average !== null)
    .sort((a, b) => a.average - b.average || a.hour - b.hour);
  return (
    <section aria-labelledby="activity-heading" className="mt-6 border-t border-sand-200/10 pt-5">
      <h3 id="activity-heading" className="text-base">
        Activity by local day and hour
      </h3>
      <p className="mt-2 text-sm text-sand-400">
        Last seven days of aggregate server observations. Per-map and per-server counts are not reported. Missing
        observations are not zero; a sample is one successful reading, normally collected once per minute.
      </p>
      <p className="mt-2 text-xs text-sand-400">
        Last observation: {new Date(latest).toLocaleString()}
        {age < 0 ? ' (device clock is behind)' : age > 120_000 ? ' (stale)' : ' (recent)'}
      </p>
      <div role="group" aria-label="Choose a day" className="mt-4 flex flex-wrap gap-2">
        {DAYS.map((label, index) => (
          <Button
            key={label}
            type="button"
            aria-pressed={day === index}
            onClick={() => setDay(index)}
            className="min-h-11 border border-sand-200/20 px-3 text-xs aria-pressed:border-spice-500 aria-pressed:text-spice-300"
          >
            {label.slice(0, 3)}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
        {cells.slice(day * 24, day * 24 + 24).map((cell, hour) => (
          <div
            key={hour}
            className={`rounded border p-2 text-xs ${cell.average === null ? 'border-sand-200/10 text-sand-500' : cell.average >= highest * 0.67 ? 'border-spice-500/60 bg-spice-500/20 text-sand-100' : 'border-spice-500/20 bg-spice-500/5 text-sand-200'}`}
          >
            <span className="block font-semibold">{String(hour).padStart(2, '0')}:00</span>
            <span className="block">{cell.average === null ? 'No data' : `${cell.average.toFixed(1)} avg`}</span>
            <span className="block">{cell.samples} samples</span>
          </div>
        ))}
      </div>
      {observed.length > 1 && (
        <p className="mt-3 text-xs text-sand-400">
          Quietest observed hour: {String(observed[0].hour).padStart(2, '0')}:00 ({observed[0].samples} samples).
          Busiest: {String(observed[observed.length - 1].hour).padStart(2, '0')}:00 (
          {observed[observed.length - 1].samples} samples).
        </p>
      )}
      <p className="mt-3 text-xs text-sand-500">
        Brighter cells indicate higher observed averages; comparisons with few samples may be incomplete.
      </p>
    </section>
  );
}
