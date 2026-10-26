'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, type ChangeEvent } from 'react';
import type { DashboardSnapshot, MapId, PopulationPoint, SpiceSectorStatus } from '../lib/types';
import MetricCard from './MetricCard';
import SystemLogsPanel from './SystemLogsPanel';

type TabId = 'overview' | 'spice' | 'market' | 'population' | 'logs';

const TABS: ReadonlyArray<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'spice', label: 'Spice sectors' },
  { id: 'market', label: 'Markets' },
  { id: 'population', label: 'Population' },
  { id: 'logs', label: 'System logs' },
];

const STATUS_STYLES: Record<SpiceSectorStatus, string> = {
  harvesting: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400',
  contested: 'border-amber-400/30 bg-amber-400/10 text-amber-400',
  dormant: 'border-edge bg-ink text-zinc-500',
};

const number = new Intl.NumberFormat('en-US');

function formatNumber(value: number | null): string {
  return value == null ? '—' : number.format(value);
}

function formatHours(value: number | null): string {
  return value == null ? '—' : `${number.format(Math.round(value))} h`;
}

/** Cycle countdown derived from the snapshot clock so SSR and hydration agree. */
function formatCycle(iso: string | null, observedAtMs: number): string {
  if (!iso) return 'Not reported';
  const remaining = Date.parse(iso) - observedAtMs;
  if (!Number.isFinite(remaining)) return 'Not reported';
  if (remaining <= 0) return 'Awaiting update';
  const minutes = Math.floor(remaining / 60000);
  return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes / 60) % 24}h ${minutes % 60}m`;
}

type HourlyBucket = { label: string; average: number };

function bucketHourly(points: PopulationPoint[], to: number): HourlyBucket[] {
  const hourMs = 3600_000;
  const buckets: HourlyBucket[] = [];
  for (let offset = 24; offset > 0; offset--) {
    const start = to - offset * hourMs;
    const end = start + hourMs;
    const inBucket = points.filter((point) => point.at >= start && point.at < end);
    const average =
      inBucket.length === 0 ? 0 : Math.round(inBucket.reduce((sum, point) => sum + point.online, 0) / inBucket.length);
    buckets.push({ label: `${new Date(start).getUTCHours().toString().padStart(2, '0')}:00`, average });
  }
  return buckets;
}

export default function InteractiveControls({
  snapshot,
  maps,
}: {
  snapshot: DashboardSnapshot;
  maps: readonly MapId[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const observedAtMs = Date.parse(snapshot.observedAt);
  const { populationHistory } = snapshot;
  const onlineNow = populationHistory.points.length
    ? populationHistory.points[populationHistory.points.length - 1].online
    : null;
  const harvesting = snapshot.spiceSectors.filter((sector) => sector.status === 'harvesting');
  const contested = snapshot.spiceSectors.filter((sector) => sector.status === 'contested');
  const hourlyPopulation = useMemo(
    () => bucketHourly(populationHistory.points, populationHistory.to),
    [populationHistory],
  );
  const maxHourly = Math.max(1, ...hourlyPopulation.map((bucket) => bucket.average));

  function onMapChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = event.target.value as MapId;
    router.replace(`/?map=${next}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          Observed <time dateTime={snapshot.observedAt}>{snapshot.observedAt.slice(0, 19).replace('T', ' ')}</time> UTC
        </p>
        <label className="flex items-center gap-2 text-xs text-zinc-500">
          Map
          <select
            value={snapshot.map}
            onChange={onMapChange}
            className="rounded-full border border-edge bg-panel px-3 py-1.5 text-sm text-zinc-200 focus:border-accent focus:outline-none"
          >
            {maps.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        role="tablist"
        aria-label="Dashboard sections"
        className="flex flex-wrap items-center gap-1 rounded-full border border-edge bg-panel p-1"
      >
        {TABS.map((tab) => {
          const active = tab.id === activeTab;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${
                active ? 'bg-accent font-medium text-white' : 'text-zinc-400 hover:bg-white/5 hover:text-zinc-100'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          <MetricCard label="Harvesting sectors" value={formatNumber(harvesting.length)} hint={snapshot.map} live />
          <MetricCard label="Contested sectors" value={formatNumber(contested.length)} hint="Active grid cells" />
          <MetricCard label="Exchange listings" value={formatNumber(snapshot.marketCounts.listings)} live />
          <MetricCard label="Unique items" value={formatNumber(snapshot.marketCounts.items)} />
          <MetricCard label="Player listings" value={formatNumber(snapshot.marketCounts.playerListings)} />
          <MetricCard label="Online now" value={formatNumber(onlineNow)} hint="Latest population sample" live />
          <MetricCard label="Peak 24h" value={formatNumber(populationHistory.peak)} />
          <MetricCard label="Play hours 24h" value={formatHours(populationHistory.playHours)} />
          <MetricCard
            label="Landsraad decided"
            value={snapshot.landsraad ? `${snapshot.landsraad.decided}/${snapshot.landsraad.total}` : '—'}
            hint={
              snapshot.landsraad
                ? `${snapshot.landsraad.term} · Atreides ${snapshot.landsraad.atreides} · Harkonnen ${snapshot.landsraad.harkonnen}`
                : 'Council data unavailable'
            }
          />
          <MetricCard label="Next coriolis cycle" value={formatCycle(snapshot.nextCycleAt, observedAtMs)} />
          <MetricCard
            label="Total play hours"
            value={formatHours(snapshot.totalPlayHours)}
            hint="All registered characters"
          />
        </div>
      ) : null}

      {activeTab === 'spice' ? (
        snapshot.spiceSectors.length === 0 ? (
          <p className="rounded-2xl border border-edge bg-panel px-4 py-6 text-sm text-zinc-500">
            No active spice sectors reported for {snapshot.map}.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-edge bg-panel">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-edge text-left text-xs tracking-wide text-zinc-500 uppercase">
                  <th className="px-4 py-3 font-medium">Sector</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Controller</th>
                  <th className="px-4 py-3 text-right font-medium">Solari / hour</th>
                  <th className="px-4 py-3 text-right font-medium">Harvesters</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {snapshot.spiceSectors.map((sector) => (
                  <tr key={sector.id}>
                    <td className="px-4 py-3 font-mono text-zinc-200">{sector.id}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[sector.status]}`}
                      >
                        {sector.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{sector.controller}</td>
                    <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">
                      {number.format(sector.solariPerHour)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-300 tabular-nums">{sector.harvesters}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {activeTab === 'market' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <MetricCard label="Exchange listings" value={formatNumber(snapshot.marketCounts.listings)} live />
            <MetricCard label="Unique items" value={formatNumber(snapshot.marketCounts.items)} />
            <MetricCard
              label="Player listings"
              value={formatNumber(snapshot.marketCounts.playerListings)}
              hint="Share of the exchange offered by players"
            />
          </div>
          <p className="rounded-2xl border border-edge bg-panel px-4 py-3 text-xs text-zinc-500">
            Counts mirror the CHOAM exchange stats endpoint and refresh with each 30 second snapshot window.
          </p>
        </div>
      ) : null}

      {activeTab === 'population' ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Online now" value={formatNumber(onlineNow)} live />
            <MetricCard label="Peak 24h" value={formatNumber(populationHistory.peak)} />
            <MetricCard label="Play hours 24h" value={formatHours(populationHistory.playHours)} />
            <MetricCard
              label="Coverage"
              value={`${populationHistory.coverageHours.toFixed(1)} h`}
              hint="Sampled window"
            />
          </div>
          <div className="rounded-2xl border border-edge bg-panel p-4">
            <p className="mb-3 text-xs tracking-wide text-zinc-500 uppercase">Average online per hour, last 24 hours</p>
            <div
              className="flex h-44 items-end gap-1"
              role="img"
              aria-label="Hourly average online population for the last 24 hours"
            >
              {hourlyPopulation.map((bucket) => (
                <div
                  key={bucket.label}
                  title={`${bucket.label} UTC · ${bucket.average} avg`}
                  className={`flex-1 rounded-md ${bucket.average >= maxHourly ? 'bg-accent' : 'bg-zinc-700'}`}
                  style={{ height: `${Math.max(3, Math.round((bucket.average / maxHourly) * 100))}%` }}
                />
              ))}
            </div>
            <div className="mt-2 flex gap-1 font-mono text-[10px] text-zinc-600">
              {hourlyPopulation.map((bucket, index) => (
                <span key={bucket.label} className="flex-1 text-center">
                  {index % 6 === 0 ? bucket.label : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'logs' ? <SystemLogsPanel logs={snapshot.systemLogs} /> : null}
    </div>
  );
}
