import type { Metadata } from 'next';
import { requireSession } from '../../../features/auth/server/session';
import { PageHeader, Notice } from '../../../components/ui/page-header';
import { listCommunityEvents } from '../../../features/events/server/store';
import { getEventRegistration } from '../../../features/events/server/registrations-store';
import { CommunityEvents } from '../../../features/events/components/community-events';

export const metadata: Metadata = { title: 'Community events' };

export default async function EventsPage() {
  const session = await requireSession();
  let events;
  try {
    events = await listCommunityEvents();
  } catch {
    events = null;
  }
  const registrations = events
    ? Object.fromEntries(
        await Promise.all(
          events.map(async (event) => [event.id, await getEventRegistration(event, session.user.id).catch(() => null)]),
        ),
      )
    : {};
  return (
    <>
      <PageHeader eyebrow="Built by the community" title="Community events">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Competitions, shared adventures, and a reason to bring your best to Arrakis.
        </p>
      </PageHeader>
      {events ? (
        <CommunityEvents events={events} registrations={registrations} />
      ) : (
        <Notice title="Events are temporarily unavailable" tone="warn">
          We couldn’t load community events. Refresh the page to try again.
        </Notice>
      )}
    </>
  );
}
