import Link from 'next/link';
import type { AdminOverview } from '../../../../features/admin/overview';
import { operationHref } from '../../../../features/admin/navigation';
import type { AdminOperation } from '../../../../features/admin/types';
import { OverviewRefresh, OverviewTrends } from './overview-live';
import { ui } from './ui';

const QUICK_LINKS = [
  ['get-players', 'Players & moderation'],
  ['get-guilds', 'Guild membership'],
  ['get-bases', 'Bases & storage'],
  ['get-vehicles', 'Vehicles'],
  ['get-maps', 'Maps & world'],
  ['get-backups', 'Backups'],
  ['get-exchange-stats', 'Market statistics'],
  ['get-logs-services', 'Logs & monitoring'],
] as const;

function metricNumber(data: AdminOverview, id: string) {
  const value = data.metrics.find((entry) => entry.id === id)?.value;
  return typeof value === 'number' ? value : null;
}

/** Server-rendered control center and setup checklist; the data comes straight from the shared loader. */
export function OverviewView({
  data,
  error,
  operations,
  setupOnly,
}: {
  data: AdminOverview | null;
  error: string;
  operations: readonly AdminOperation[];
  setupOnly: boolean;
}) {
  const href = (id: string) => operationHref(operations, id);
  return (
    <section className={ui.controlCenter} aria-label={setupOnly ? 'Administration setup' : 'Administration overview'}>
      <header className={ui.directoryHeading}>
        <div>
          <p className={ui.eyebrow}>{setupOnly ? 'CONNECTIONS & CONFIGURATION' : 'CONTROL CENTER'}</p>
          <h2>{setupOnly ? 'Set up administration' : 'Server overview'}</h2>
          <p>{data ? `Last reading ${new Date(data.observedAt).toLocaleString()}` : 'No reading is available.'}</p>
        </div>
        <div className={ui.actions}>
          <OverviewRefresh />
          {!setupOnly && (
            <Link
              href="/admin?tab=setup"
              className="inline-flex min-h-9 items-center border border-sand-200/20 bg-sand-100/10 px-3.5 py-1.5 text-xs font-medium text-sand-300 hover:bg-spice-500/15 hover:text-sand-100"
            >
              Connection setup
            </Link>
          )}
        </div>
      </header>
      {error && (
        <p role="alert" className={ui.error}>
          {error}
        </p>
      )}
      {data && (
        <>
          {!setupOnly && (
            <>
              <div className={ui.statGrid}>
                {data.metrics.map((metric) => (
                  <Link key={metric.id} href={href(metric.operation)} className={`${ui.statCard} no-underline`}>
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
                  </Link>
                ))}
              </div>
              <OverviewTrends
                observedAt={data.observedAt}
                online={metricNumber(data, 'online')}
                cpu={metricNumber(data, 'cpu')}
              />
              <div className={ui.quickGrid}>
                {QUICK_LINKS.map(([id, label]) => (
                  <Link key={id} href={href(id)}>
                    {label}
                    <span>Open tools ↗</span>
                  </Link>
                ))}
              </div>
              <section className={ui.panel}>
                <h3>Service status</h3>
                {data.services.length ? (
                  <div className={ui.serviceList}>
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
                <Link href={href('get-server-services')}>Inspect services</Link>
              </section>
            </>
          )}
          {setupOnly && (
            <section className={ui.panel}>
              <h3>Setup checklist</h3>
              <p>
                Credentials stay in the server environment. After changing deployment settings, restart the dashboard
                and recheck connections.
              </p>
              <div className={ui.setupList}>
                {data.setup.map((check) => (
                  <article key={check.id}>
                    <header>
                      <strong>{check.label}</strong>
                      <span className={check.ready ? ui.ready : ui.needsAttention}>
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
          <section className={ui.panel}>
            <h3>API connection checks</h3>
            <p>
              Each check is a read-only request. A configured credential can still be refused if its scopes are missing.
            </p>
            <div className={ui.tableScroll}>
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
                        <Link href={href(source.operation)}>{source.label}</Link>
                      </td>
                      <td>
                        <span className={source.state === 'ready' ? ui.ready : ui.needsAttention}>
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
