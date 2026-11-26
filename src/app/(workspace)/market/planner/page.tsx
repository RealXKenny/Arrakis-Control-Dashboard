import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '../../../../features/auth/server/session';
import { PageHeader } from '../../../../components/ui/page-header';
import { MarketPlanner } from '../../../../features/market/components/market-planner';
import { parsePlannerPrefill } from '../../../../features/market/planner';

export const metadata: Metadata = { title: 'Market planner' };

export default async function MarketPlannerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const prefill = parsePlannerPrefill(await searchParams);
  return (
    <>
      <PageHeader eyebrow="CHOAM exchange" title="Market planner">
        <Link href="/market" className="btn btn-ghost">
          Back to market
        </Link>
      </PageHeader>
      <MarketPlanner prefill={prefill} />
    </>
  );
}
