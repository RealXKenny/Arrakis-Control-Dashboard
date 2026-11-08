import type { Metadata } from 'next';
import { loadPortalProfile } from '../../../../features/portal/server/load';
import { requireSession } from '../../../../features/auth/server/session';
import { ProfileFailure } from '../../../../components/feedback/gauge-notice';
import { Notice, PageHeader } from '../../../../components/ui/page-header';
import { PreviewHost } from '../../../../features/bases/components/holdings/preview-host';

export const metadata: Metadata = { title: 'Base preview' };

export default async function BasePreviewPage() {
  const session = await requireSession();
  const result = await loadPortalProfile(session);
  if (result.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Your holdings" title="Base preview" />
        <ProfileFailure result={result} />
      </>
    );
  }
  const owned = result.profile.bases.filter((base) => base.owned).map(({ id, name }) => ({ id, name }));
  if (owned.length === 0) {
    return (
      <>
        <PageHeader eyebrow="Your holdings" title="Base preview" />
        <Notice title="No owned bases">Only bases you own can be previewed in 3D.</Notice>
      </>
    );
  }
  return <PreviewHost bases={owned} />;
}
