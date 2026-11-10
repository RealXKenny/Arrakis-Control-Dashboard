import type { Metadata } from 'next';
import Link from 'next/link';
import { requireSession } from '../../../../features/auth/server/session';
import { PageHeader } from '../../../../components/ui/page-header';
import { UploadForm } from '../../../../features/bases/components/upload-form';

export const metadata: Metadata = { title: 'Share a base' };

export default async function UploadBasePage() {
  await requireSession();
  return (
    <>
      <PageHeader eyebrow="Community" title="Share a base">
        <Link href="/bases" className="btn btn-ghost">
          Back to marketplace
        </Link>
      </PageHeader>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <UploadForm />
        </div>
        <aside className="min-w-0 lg:col-span-5">
          <div className="panel p-6 sm:p-8">
            <h2 className="text-base">Before you publish</h2>
            <ul className="mt-5 grid gap-3 text-sm leading-relaxed text-sand-300">
              <li>Upload a base layout exported as JSON, up to 2 MiB and 10,000 pieces.</li>
              <li>A downloaded marketplace listing can be re-uploaded unchanged.</li>
              <li>A picture helps your base stand out. Keep it under 700 KiB.</li>
              <li>You can share up to 25 bases and remove any of your own at any time.</li>
            </ul>
          </div>
        </aside>
      </div>
    </>
  );
}
