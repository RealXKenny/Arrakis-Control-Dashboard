import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { ActivityManager } from './activity-manager';
export const metadata: Metadata = { title: 'Activity views' };
export default async function ActivityPage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader eyebrow="Your dashboard, by activity" title="Activity views" />
      <ActivityManager key={session.user.id} />
    </>
  );
}
