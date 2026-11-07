import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerEnv } from '../../../../lib/env';
import { isDashboardAdmin } from '../../../../modules/admin/server/access';
import { readChangelog } from '../../../../modules/changelog/server/read';
import { getAnnouncementStatus } from '../../../../server/changelog-announce';
import { requireSession } from '../../../../server/session';
import { PageHeader } from '../../_components/page-header';
import { Composer } from './_components/composer';

export const metadata: Metadata = { title: 'Discord announcements' };

export default async function AdminChangelogPage() {
  const session = await requireSession();
  // Hide the page's existence from everyone but the verified administrator.
  if (!isDashboardAdmin(session)) notFound();

  const [releases, status] = await Promise.all([readChangelog(), getAnnouncementStatus()]);
  const env = getServerEnv();

  return (
    <>
      <PageHeader eyebrow="Administration" title="Discord announcements">
        <dl className="flex flex-wrap gap-x-8 gap-y-2 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
          <div className="flex gap-2">
            <dt className="text-sand-600">Webhook</dt>
            <dd className={status.configured ? 'text-status-ok' : 'text-status-warn'}>
              {status.configured ? 'Configured' : 'Not set'}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-sand-600">Auto-announce</dt>
            <dd>{status.autoAnnounce ? 'On' : 'Off'}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-sand-600">Last auto release</dt>
            <dd>{status.lastAnnounced ?? '—'}</dd>
          </div>
        </dl>
      </PageHeader>

      <Composer
        releases={releases.map(({ version, date, sections }) => ({ version, date, sections }))}
        appUrl={env.APP_URL}
        canSend={status.configured}
      />

      <section aria-labelledby="history" className="mt-12">
        <h2 id="history" className="eyebrow">
          Recent announcements
        </h2>
        {status.history.length === 0 ? (
          <p className="mt-4 text-sm text-sand-500">Nothing sent yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-sand-200/10 border border-sand-200/10">
            {status.history.map((entry) => (
              <li
                key={`${entry.at}:${entry.version}`}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="font-semibold text-sand-100">
                  v{entry.version} <span className="font-normal text-sand-500">· {entry.kind}</span>
                  {entry.edited && <span className="ml-2 text-xs text-spice-300">edited</span>}
                </span>
                <span className="font-mono text-xs text-sand-500">
                  {entry.by} · <time dateTime={entry.at}>{entry.at.slice(0, 16).replace('T', ' ')} UTC</time>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
