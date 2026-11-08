import Link from 'next/link';
import type { AdminOperation } from '../types';
import { adminHref, tabForOperation } from '../navigation';
import { ui } from './ui';

/** Honest handoff list: nothing here submits a request, because the API key cannot perform these operations. */
export default function ConsoleOnly({
  operations,
  consoleOrigin,
}: {
  operations: AdminOperation[];
  consoleOrigin: string | null;
}) {
  const restricted = operations.filter((entry) => entry.restriction);
  const groups = [...new Set(restricted.map((entry) => entry.group))];
  return (
    <section className={ui.panel} aria-label="Console-only administration">
      <p className={ui.eyebrow}>CONSOLE-ONLY</p>
      <h2>Managed in the Console</h2>
      <p>
        {restricted.length} operations are limited to a signed-in Console session, so the dashboard&apos;s scoped API
        credential cannot run them. This dashboard never forwards a Console password or session. Open the Console to use
        them; read-only tools that the credential does support stay available in their own screens.
      </p>
      {consoleOrigin && (
        <p>
          <a href={consoleOrigin} target="_blank" rel="noreferrer">
            Open Console ↗
          </a>
        </p>
      )}
      <div className={ui.tableScroll}>
        <table>
          <caption className="sr-only">Console-only operations by feature</caption>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Restricted</th>
              <th>Examples</th>
              <th>Related screen</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const entries = restricted.filter((entry) => entry.group === group);
              const owner = tabForOperation(entries[0]);
              return (
                <tr key={group}>
                  <td>{group}</td>
                  <td>{entries.length}</td>
                  <td>
                    {entries
                      .slice(0, 3)
                      .map((entry) => entry.title)
                      .join(' · ')}
                  </td>
                  <td>{owner ? <Link href={adminHref(owner.tab.id)}>{owner.tab.label}</Link> : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
