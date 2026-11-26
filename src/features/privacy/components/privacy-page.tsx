import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader } from '../../../components/ui/page-header';
import { PrivacyCenter } from './privacy-center';
export const metadata: Metadata = { title: 'Privacy center' };
export default async function PrivacyPage() {
  const session = await requireSession();
  return (
    <>
      <PageHeader eyebrow="Choose what leaves your private workspace" title="Privacy center" />
      <PrivacyCenter key={session.user.id} />
    </>
  );
}
