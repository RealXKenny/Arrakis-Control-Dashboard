import type { Metadata } from 'next';
import Link from 'next/link';
import { loadPortalProfile } from '../../../features/portal/server/load';
import { requireSession } from '../../../features/auth/server/session';
import { ProfileFailure } from '../../../components/feedback/gauge-notice';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { SegmentedNav } from '../../../components/ui/segmented-nav';
import { HoldingCard } from '../../../features/bases/components/holdings/base-card';

export const metadata: Metadata = { title: 'Holdings' };

export default async function HoldingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { view: requested } = await searchParams;
  const result = await loadPortalProfile(session);
  if (result.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Your holdings" title="Bases" />
        <ProfileFailure result={result} />
      </>
    );
  }

  const owned = result.profile.bases.filter((base) => base.owned);
  const shared = result.profile.bases.filter((base) => !base.owned);
  const showBar = owned.length > 0 && shared.length > 0;
  const view = !showBar ? (owned.length ? 'owned' : 'shared') : requested === 'shared' ? 'shared' : 'owned';
  const visible = view === 'owned' ? owned : shared;

  return (
    <>
      <PageHeader eyebrow="Your holdings" title="Bases">
        <div className="flex items-center gap-4">
          <p className="font-mono text-xs uppercase tracking-widest text-sand-400">
            {result.profile.bases.length} total
          </p>
          {owned.length > 0 && (
            <Link href="/holdings/preview" className="btn btn-ghost min-h-9 px-4 text-[0.6875rem]">
              3D preview
            </Link>
          )}
        </div>
      </PageHeader>

      {visible.length === 0 ? (
        <Notice title="No bases">You do not own or have access to any bases yet.</Notice>
      ) : (
        <>
          {showBar && (
            <SegmentedNav
              label="Base access"
              active={view}
              items={[
                { id: 'owned', label: 'Owned', count: owned.length, href: '/holdings' },
                { id: 'shared', label: 'Shared', count: shared.length, href: '/holdings?view=shared' },
              ]}
            />
          )}
          <ul className="grid gap-5 lg:grid-cols-2">
            {visible.map((base) => (
              <li key={base.id} className="min-w-0">
                <HoldingCard base={base} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
