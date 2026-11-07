import { useEffect, useState } from 'react';
import { findOperation } from '../client';
import { Trend } from '../components/AdminOverviewPanel';
import { Facts, QueryState } from '../components/DataPanel';
import useAdminOverview from '../hooks/useAdminOverview';
import useAdminQuery from '../hooks/useAdminQuery';
import type { AdminOverview } from '../overview';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const STALE_MS = 90_000;

/** "12 s ago" style freshness that never claims a reading is newer than it is. */
export function freshness(readAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - readAt) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.round(seconds / 60);
  return minutes < 60 ? `${minutes} min ago` : `${Math.round(minutes / 60)} h ago`;
}

function useNow(interval = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

type Row = {
  label: string;
  value: string;
  source: string;
  state: 'Available' | 'Not reported' | 'Source failed' | 'Not configured';
  note?: string;
};

/** Pure: turn one overview reading into labelled rows; null becomes "Not reported", never zero. */
export function readingRows(data: AdminOverview, operations: AdminOperation[]): Row[] {
  return data.metrics.map((metric) => {
    const source = data.sources.find((entry) => entry.operation === metric.operation);
    const full = operations.find((entry) => entry.id === metric.operation)?.title ?? metric.operation;
    // Catalog titles can carry usage notes after the first sentence; show only the name.
    const title = full.split('. ')[0];
    const failed = source && source.state !== 'ready';
    const available = metric.value !== null && !failed;
    return {
      label: metric.label,
      value: available
        ? `${typeof metric.value === 'number' ? metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 }) : metric.value}${metric.unit && !String(metric.value).endsWith(metric.unit) ? metric.unit : ''}`
        : '—',
      source: title,
      state:
        source?.state === 'unconfigured'
          ? 'Not configured'
          : failed
            ? 'Source failed'
            : available
              ? 'Available'
              : 'Not reported',
      note: failed ? source?.error : undefined,
    };
  });
}

function StatPanel({
  operations,
  id,
  title,
  description,
}: {
  operations: AdminOperation[];
  id: string;
  title: string;
  description: string;
}) {
  const operation = findOperation(operations, id);
  const query = useAdminQuery(operation);
  const now = useNow();
  return (
    <section className={css.panel} aria-label={title}>
      <h3>{title}</h3>
      <p className={css.stateLine}>
        {description} Source: {operation?.title ?? id}.
        {query.readAt
          ? ` Read ${freshness(query.readAt, now)}${now - query.readAt > STALE_MS ? ' (stale — refresh)' : ''}.`
          : ''}
      </p>
      <QueryState loading={query.loading} error={query.error} onRetry={query.refresh}>
        <Facts value={query.data} />
      </QueryState>
      <div className={css.actions}>
        <button type="button" onClick={query.refresh} disabled={query.loading}>
          Refresh
        </button>
      </div>
    </section>
  );
}

export default function StatisticsScreen({
  operations,
  adapterConfigured,
}: {
  operations: AdminOperation[];
  adapterConfigured: boolean;
}) {
  const overview = useAdminOverview(true);
  const now = useNow();
  const observed = overview.data ? new Date(overview.data.observedAt).getTime() : null;
  const stale = observed !== null && now - observed > STALE_MS;
  const rows = overview.data ? readingRows(overview.data, operations) : [];
  return (
    <div className={css.screen}>
      <section className={css.panel} aria-label="How to read these statistics">
        <h3>How to read these statistics</h3>
        <ul>
          <li>
            Every figure is a current reading from the Console or the Discord adapter. Nothing is estimated or
            back-filled.
          </li>
          <li>“Not reported” means the source did not supply the figure. It is never shown as zero.</li>
          <li>
            Counts come from list totals only when the source reports a total; the size of one page is never used as a
            total.
          </li>
          <li>
            The trend charts only cover this browser session: up to 20 readings taken 30 seconds apart. Long-term
            history is not stored.
          </li>
          <li>Units appear only where the source states them (percentages for CPU and memory).</li>
        </ul>
      </section>
      <section className={css.panel} aria-label="Current readings">
        <h3>Current readings</h3>
        <p className={css.stateLine} role="status">
          {overview.data
            ? `Last reading ${new Date(overview.data.observedAt).toLocaleTimeString()} (${freshness(observed ?? now, now)})${stale ? ' — stale' : ''}.`
            : overview.loading
              ? 'Taking the first reading…'
              : 'No reading yet.'}
        </p>
        {overview.error && (
          <p role="alert" className={css.error}>
            {overview.error}
          </p>
        )}
        <div className={css.actions}>
          <button type="button" onClick={overview.refresh} disabled={overview.loading}>
            {overview.loading ? 'Refreshing…' : 'Refresh readings'}
          </button>
        </div>
        {rows.length > 0 && (
          <div className={css.tableScroll}>
            <table>
              <caption className="sr-only">Current administration readings</caption>
              <thead>
                <tr>
                  <th>Measure</th>
                  <th>Value</th>
                  <th>Status</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{row.value}</td>
                    <td>
                      {row.state}
                      {row.note ? ` — ${row.note}` : ''}
                    </td>
                    <td>{row.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className={css.trendGrid}>
        <Trend label="Online player trend" values={overview.history.map((entry) => entry.online)} />
        <Trend label="CPU usage trend" values={overview.history.map((entry) => entry.cpu)} />
      </div>
      <div className={css.statPanels}>
        <StatPanel
          operations={operations}
          id="get-exchange-stats"
          title="Market"
          description="Exchange statistics as the Console reports them; the time window is the Console’s."
        />
        {adapterConfigured ? (
          <>
            <StatPanel
              operations={operations}
              id="get-integrations-discord-population"
              title="Population (Discord adapter)"
              description="Population as the adapter reports it."
            />
            <StatPanel
              operations={operations}
              id="get-integrations-discord-ops-activity"
              title="Activity (Discord adapter)"
              description="Operational activity readings."
            />
            <StatPanel
              operations={operations}
              id="get-integrations-discord-ops-combat"
              title="Combat (Discord adapter)"
              description="Combat readings."
            />
            <StatPanel
              operations={operations}
              id="get-integrations-discord-ops-resources"
              title="Resources (Discord adapter)"
              description="Resource readings."
            />
            <StatPanel
              operations={operations}
              id="get-integrations-discord-ops-economy"
              title="Economy (Discord adapter)"
              description="Economy readings."
            />
          </>
        ) : (
          <p className={css.stateLine}>
            Adapter statistics (population, activity, combat, resources, economy) are unavailable because the Discord
            adapter is not configured on the dashboard server.
          </p>
        )}
      </div>
      <p className={css.stateLine}>
        Per-player statistics, event history and long-term trends are not available from the Console API, so they are
        not shown.
      </p>
    </div>
  );
}
