import type { Metadata } from 'next';
import { PageHeader, Notice } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { AssistanceBoard } from '../../../features/assistance/components/assistance-board';
import { readHelpRequests } from '../../../features/assistance/server/requests-store';
import { readVolunteer } from '../../../features/assistance/server/volunteers-store';
import { helpRequestView, helpVolunteerViewSchema, type HelpRequestView } from '../../../features/assistance/model';

export const metadata: Metadata = { title: 'Player assistance' };

export default async function HelpPage() {
  const session = await requireSession();
  let requests: HelpRequestView[] | null = null;
  let volunteer = null;
  try {
    const [records, availability] = await Promise.all([readHelpRequests(), readVolunteer(session.user.id)]);
    requests = records.flatMap((record) => {
      const view = helpRequestView(record, session.user.id);
      return view ? [view] : [];
    });
    const { owner: _owner, ...view } = availability;
    volunteer = helpVolunteerViewSchema.parse(view);
  } catch {
    requests = null;
  }
  return (
    <>
      <PageHeader eyebrow="Community guidance" title="Player assistance">
        <p className="max-w-md text-sm text-sand-400">
          Request help with the game or volunteer your experience. Assigned chats are visible only to participants.
        </p>
      </PageHeader>
      {requests && volunteer ? (
        <AssistanceBoard initialRequests={requests} initialVolunteer={volunteer} />
      ) : (
        <Notice title="Player assistance is temporarily unavailable" tone="warn">
          The help board could not be loaded. Refresh the page to try again.
        </Notice>
      )}
    </>
  );
}
