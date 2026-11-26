import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { SegmentedNav } from '../../../components/ui/segmented-nav';
import { parseUpkeepView } from '../model';
import { Upkeep } from './upkeep';

export const metadata: Metadata = { title: 'Base upkeep' };

const tabs = [
  { id: 'care', label: 'Care inbox', href: '/upkeep' },
  { id: 'bases', label: 'Base plans', href: '/upkeep?view=bases' },
  { id: 'reminders', label: 'Reminders', href: '/upkeep?view=reminders' },
  { id: 'blueprints', label: 'Blueprints', href: '/upkeep?view=blueprints' },
  { id: 'relocation', label: 'Relocation', href: '/upkeep?view=relocation' },
];

export default async function UpkeepPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const view = parseUpkeepView((await searchParams).view);
  return (
    <>
      <PageHeader
        eyebrow="Your holdings"
        title="Base upkeep"
        description="Private alerts, checklists, reminders and plans for the bases your linked character can inspect. Plans never perform game actions."
      />
      <SegmentedNav label="Base upkeep sections" active={view} items={tabs} />
      <Upkeep key={view} view={view} />
    </>
  );
}
