import type { Metadata } from 'next';
import { PageHeader } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { loadCalendar } from '../../../features/calendar/server/load';
import { CommunityCalendar } from '../../../features/calendar/components/calendar';

export const metadata: Metadata = { title: 'Community calendar' };

export default async function CalendarPage() {
  const session = await requireSession();
  const data = await loadCalendar(session);
  return (
    <>
      <PageHeader eyebrow="Shared plans" title="Community calendar">
        <p className="max-w-md text-sm text-sand-400">Events, your guild commitments, and confirmed queued restarts.</p>
      </PageHeader>
      <CommunityCalendar data={data} />
    </>
  );
}
