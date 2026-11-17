import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { Inbox } from './inbox';
import { resolveActivity } from '../../activity-views/server/resolve';
import { ActivityBar } from '../../activity-views/components/activity-bar';
export const metadata: Metadata = { title: 'Actionable inbox' };
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const activity = await resolveActivity(session.user.id, (await searchParams).activity);
  return (
    <>
      <PageHeader eyebrow="Your field dispatches" title="Actionable inbox" />
      <ActivityBar state={activity} area="inbox" />
      {(activity.status === 'none' || activity.status === 'ok') && (
        <Inbox
          key={`${session.user.id}:${activity.status === 'ok' ? JSON.stringify(activity.view) : 'normal'}`}
          activity={activity.status === 'ok' ? activity.view : null}
        />
      )}
    </>
  );
}
