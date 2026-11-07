import Link from 'next/link';
import ConsoleHandoff from '../parts/ConsoleHandoff';
import { ReadPanel } from '../parts/DataPanel';
import useAdminUrl from '../hooks/useAdminUrl';
import { adminHref } from '../../../../../features/admin/navigation';
import type { AdminOperation } from '../../../../../features/admin/types';
import { ui } from '../ui';

const VIEWS = [
  ['status', 'Adapter status'],
  ['activity', 'Population & activity'],
  ['capabilities', 'Capabilities'],
  ['lookups', 'Links & lookups'],
] as const;

export default function DiscordScreen({
  operations,
  adapterConfigured,
  consoleOrigin,
}: {
  operations: AdminOperation[];
  adapterConfigured: boolean;
  consoleOrigin: string | null;
}) {
  const url = useAdminUrl();
  const view = VIEWS.find(([id]) => id === url.read('view'))?.[0] ?? 'status';
  if (!adapterConfigured)
    return (
      <section className={ui.panel} aria-label="Adapter not configured">
        <h3>The Discord adapter is not configured</h3>
        <p>
          Set <code>ADAPTER_TOKEN</code> on the dashboard server and restart it to enable adapter reads. That token is
          separate from the administration Console key and is never shown in the browser.
        </p>
      </section>
    );
  return (
    <div className={ui.screen}>
      <p className={ui.stateLine}>
        Adapter calls always carry your verified dashboard identity. The adapter enforces its own scopes, so a reading
        may be refused even when the adapter is reachable; that appears below as an error, not as zero data.
      </p>
      <div className={ui.subTabs} role="group" aria-label="Discord views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === view}
            onClick={() => url.update({ view: id === 'status' ? null : id })}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'status' && (
        <>
          <ReadPanel operations={operations} id="get-integrations-discord-health" title="Health" />
          <ReadPanel operations={operations} id="get-integrations-discord-version" title="Version" />
          <ReadPanel operations={operations} id="get-integrations-discord-readiness" title="Readiness" />
          <ReadPanel operations={operations} id="get-integrations-discord-services" title="Services" kind="table" />
          <ReadPanel operations={operations} id="get-integrations-discord-ports" title="Ports" kind="table" />
        </>
      )}
      {view === 'activity' && (
        <>
          <ReadPanel operations={operations} id="get-integrations-discord-population" title="Population" />
          <ReadPanel operations={operations} id="get-integrations-discord-ops-activity" title="Activity" />
          <ReadPanel operations={operations} id="get-integrations-discord-ops-combat" title="Combat" />
          <ReadPanel operations={operations} id="get-integrations-discord-ops-resources" title="Resources" />
          <ReadPanel operations={operations} id="get-integrations-discord-ops-economy" title="Economy" />
        </>
      )}
      {view === 'capabilities' && (
        <ReadPanel
          operations={operations}
          id="get-integrations-discord-catalog"
          title="Adapter catalog"
          kind="table"
          empty="The adapter reported no catalog."
        />
      )}
      {view === 'lookups' && (
        <>
          <section className={ui.panel} aria-label="Account links and lookups">
            <h3>Account links and lookups</h3>
            <p className={ui.stateLine}>
              Account-link verification and inventory or guild lookups take adapter-specific inputs. They open in the
              full tool form with your identity bound by the server:
            </p>
            <ul>
              {[
                ['post-integrations-discord-players-link-verify', 'Verify an account link'],
                ['get-integrations-discord-players-find', 'Find a player'],
                ['get-integrations-discord-players-inventory', 'Look up an inventory'],
                ['get-integrations-discord-guilds-find', 'Find a guild'],
              ].map(([id, label]) => (
                <li key={id}>
                  <Link href={adminHref('discord', id)}>{label}</Link>
                </li>
              ))}
            </ul>
          </section>
          <ConsoleHandoff
            operations={operations}
            ids={[
              'get-integrations-discord-map-state',
              'post-integrations-discord-maintenance',
              'get-integrations-discord-backups-list',
              'post-integrations-discord-broadcast',
              'post-integrations-discord-announcements',
              'post-integrations-discord-db',
            ]}
            consoleOrigin={consoleOrigin}
            heading="Not available through this dashboard"
          />
        </>
      )}
    </div>
  );
}
