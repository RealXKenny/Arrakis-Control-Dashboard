import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { PersonalDataCenter } from './personal-data-center';
export const metadata: Metadata = { title: 'Personal data' };
export default async function PersonalDataPage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader eyebrow="Your saved dashboard content" title="Personal data" />
      <PersonalDataCenter key={session.user.id} />
    </>
  );
}
