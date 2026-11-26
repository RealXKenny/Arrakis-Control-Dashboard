import type { Metadata } from 'next';
import { requireSession } from '../../../features/auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { ExpeditionPlanner } from '../../../features/expeditions/components/expedition-planner';
import { readDeepDesertStatus } from '../../../features/expeditions/server/deep-desert';

export const metadata: Metadata = { title: 'Expeditions' };

export default async function ExpeditionsPage() {
  await requireSession();
  const deepDesert = await readDeepDesertStatus();
  return (
    <>
      <PageHeader eyebrow="Fleet" title="Expeditions" />
      <ExpeditionPlanner deepDesert={deepDesert} />
    </>
  );
}
