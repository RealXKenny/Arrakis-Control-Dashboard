import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { Inbox } from './inbox';
export const metadata: Metadata = { title: 'Actionable inbox' };
export default async function InboxPage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader eyebrow="Your field dispatches" title="Actionable inbox" />
      <Inbox key={session.user.id} />
    </>
  );
}
