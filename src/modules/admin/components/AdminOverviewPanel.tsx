import type { AdminOperation } from '../types';
import type { AdminOverview } from '../overview';
import css from '../styles/admin.module.css';

export function Trend({ values, label }: { values: (number | null)[]; label: string }) {
  const maximum = Math.max(1, ...values.filter((value): value is number => value !== null));
  const points = values
    .map((value, index) =>
      value === null ? null : `${(index / Math.max(values.length - 1, 1)) * 400},${90 - (value / maximum) * 75}`,
    )
    .filter(Boolean)
    .join(' ');
  return (
    <article className={css.trend}>
      <h3>{label}</h3>
      {values.filter((value) => value !== null).length < 2 ? (
        <p>Collecting readings. Trends appear after the next refresh.</p>
      ) : (
        <svg viewBox="0 0 400 100" role="img" aria-label={label}>
          <path d="M0 90H400" stroke="var(--theme-border)" />
          <polyline points={points} stroke="var(--theme-accent)" strokeWidth="2" fill="none" />
        </svg>
      )}
      <small>
        Last {values.length} reading{values.length === 1 ? '' : 's'} in this session · refreshes every 30 seconds
      </small>
    </article>
  );
}

export default function AdminOverviewPanel({
  data,
  loading,
  error,
  history,
  setupOnly,
  operations,
  onSelect,
  onSetup,
  onRefresh,
}: {
  data: AdminOverview | null;
  loading: boolean;
  error: string;
  history: { time: string; online: number | null; cpu: number | null }[];
  setupOnly: boolean;
  operations: AdminOperation[];
  onSelect: (operation: AdminOperation) => void;
  onSetup: () => void;
  onRefresh: () => void;
}) {
  const choose = (id: string) => {
    const operation = operations.find((entry) => entry.id === id);
    if (operation) onSelect(operation);
  };
  return (
    <section className={css.controlCenter} aria-label={setupOnly ? 'Administration setup' : 'Administration overview'}>
      <header className={css.directoryHeading}>
        <div>
          <p className={css.eyebrow}>{setupOnly ? 'CONNECTIONS & CONFIGURATION' : 'CONTROL CENTER'}</p>
          <h2>{setupOnly ? 'Set up administration' : 'Server overview'}</h2>
          <p>{data ? `Last reading ${new Date(data.observedAt).toLocaleString()}` : 'Connecting to the Console…'}</p>
        </div>
        <div className={css.actions}>
          <button disabled={loading} onClick={onRefresh}>
            {loading ? 'Refreshing…' : 'Refresh statistics'}
          </button>
          {!setupOnly && <button onClick={onSetup}>Connection setup</button>}
        </div>
      </header>
      {error && (
        <p role="alert" className={css.error}>
          {error}
        </p>
      )}
      {loading && !data && <p role="status">Loading server statistics…</p>}
      {data && (
        <>
          {!setupOnly && (
            <>
              <div className={css.statGrid}>
                {data.metrics.map((metric) => (
                  <button key={metric.id} className={css.statCard} onClick={() => choose(metric.operation)}>
                    <span>{metric.label}</span>
                    <strong>
                      {metric.value === null
                        ? '—'
                        : typeof metric.value === 'number'
                          ? metric.value.toLocaleString(undefined, { maximumFractionDigits: 1 })
                          : metric.value}
                      {metric.value !== null && metric.unit && !String(metric.value).trim().endsWith(metric.unit)
                        ? metric.unit
                        : ''}
                    </strong>
                    <small>
                      {metric.value === null ? 'Not reported · inspect source' : 'View source and controls ↗'}
                    </small>
                  </button>
                ))}
              </div>
              <div className={css.trendGrid}>
                <Trend label="Online player trend" values={history.map((entry) => entry.online)} />
                <Trend label="CPU usage trend" values={history.map((entry) => entry.cpu)} />
              </div>
              <div className={css.quickGrid}>
                {[
                  ['get-players', 'Players & moderation'],
                  ['get-guilds', 'Guild membership'],
                  ['get-bases', 'Bases & storage'],
                  ['get-vehicles', 'Vehicles'],
                  ['get-maps', 'Maps & world'],
                  ['get-backups', 'Backups'],
                  ['get-exchange-stats', 'Market statistics'],
                  ['get-logs-services', 'Logs & monitoring'],
                ].map(([id, label]) => (
                  <button key={id} onClick={() => choose(id)}>
                    {label}
                    <span>Open tools ↗</span>
                  </button>
                ))}
              </div>
              <section className={css.panel}>
                <h3>Service status</h3>
                {data.services.length ? (
                  <div className={css.serviceList}>
                    {data.services.map((service, index) => (
                      <div key={`${service.name}-${index}`}>
                        <strong>{service.name}</strong>
                        <span>{service.state}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>Service details were not reported. Inspect the services API for more information.</p>
                )}
                <button onClick={() => choose('get-server-services')}>Inspect services</button>
              </section>
            </>
          )}
          {setupOnly && (
            <section className={css.panel}>
              <h3>Setup checklist</h3>
              <p>
                Credentials stay in the server environment. After changing deployment settings, restart the dashboard
                and recheck connections.
              </p>
              <div className={css.setupList}>
                {data.setup.map((check) => (
                  <article key={check.id}>
                    <header>
                      <strong>{check.label}</strong>
                      <span className={check.ready ? css.ready : css.needsAttention}>
                        {check.ready ? 'Configured' : 'Needs setup'}
                      </span>
                    </header>
                    <p>{check.instruction}</p>
                  </article>
                ))}
              </div>
              <p>
                Read access is required for the statistics below. Grant write scopes only for tools you intend to use.
                Console-only operations remain available through the Console.
              </p>
            </section>
          )}
          <section className={css.panel}>
            <h3>API connection checks</h3>
            <p>
              Each check is a read-only request. A configured credential can still be refused if its scopes are missing.
            </p>
            <div className={css.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Result</th>
                    <th>HTTP</th>
                    <th>Response time</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((source) => (
                    <tr key={source.operation}>
                      <td>
                        <button onClick={() => choose(source.operation)}>{source.label}</button>
                      </td>
                      <td>
                        <span className={source.state === 'ready' ? css.ready : css.needsAttention}>
                          {source.state === 'ready'
                            ? 'Connected'
                            : source.state === 'unconfigured'
                              ? 'Not configured'
                              : 'Needs attention'}
                        </span>
                      </td>
                      <td>{source.status ?? '—'}</td>
                      <td>{source.durationMs} ms</td>
                      <td>{source.error ?? 'Read succeeded'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </section>
  );
}
