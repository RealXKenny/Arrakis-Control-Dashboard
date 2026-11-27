import type { Metadata } from 'next';
import { PageHeader } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { UnwrappedStory } from '../../../features/unwrapped/components/unwrapped-story';
import { currentYear } from '../../../features/unwrapped/server/recap';

export const metadata: Metadata = { title: 'Unwrapped' };

export default async function UnwrappedPage() {
  await requireSession();
  const year = currentYear();
  return (
    <>
      <PageHeader eyebrow="Year in review" title={`Unwrapped ${year}`}>
        <p className="max-w-md text-sm text-sand-400">
          The server&apos;s year and your own, card by card. Swipe, use the arrow keys or the buttons below.
        </p>
      </PageHeader>
      <UnwrappedStory />
    </>
  );
}
