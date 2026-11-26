import type { Metadata } from 'next';
import { requireSession } from '../../../../../features/auth/server/session';
import { Notice, PageHeader } from '../../../../../components/ui/page-header';
import { RescueCardView } from '../../../../../features/expeditions/components/rescue-card';
import { readSharedRescue } from '../../../../../features/expeditions/server/rescue-store';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';

// Generic metadata: the card's content never enters the page title or link previews.
export const metadata: Metadata = { title: 'Rescue request' };

export default async function RescueRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  let card = null;
  let failed = false;
  try {
    const limit = await checkRateLimit(`v2:rescue-view:${session.user.id}`, { limit: 30, windowMs: 60_000 });
    if (!limit.allowed) throw new Error('Rate limited');
    card = await readSharedRescue(id);
  } catch {
    failed = true;
  }
  return (
    <>
      <PageHeader eyebrow="Expeditions" title="Rescue request" />
      {card ? (
        <RescueCardView card={card} />
      ) : failed ? (
        <Notice tone="warn" title="Unavailable">
          Rescue requests cannot be read right now. Try again shortly.
        </Notice>
      ) : (
        <Notice title="Request ended">This rescue request has ended, was replaced or the link is not valid.</Notice>
      )}
    </>
  );
}
