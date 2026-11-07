import type { Metadata } from 'next';
import { loadPortalProfile } from '../../../../server/portal';
import { requireSession } from '../../../../server/session';
import { ProfileFailure } from '../../_components/gauge-notice';
import { Notice, PageHeader } from '../../_components/page-header';
import { PreviewHost } from './_components/preview-host';

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
