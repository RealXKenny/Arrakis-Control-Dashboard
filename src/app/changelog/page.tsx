import type { Metadata } from 'next';
import Link from 'next/link';
import { readChangelog } from '../../features/changelog/server/read';
import { readProjectReleases } from '../../features/changelog/server/public-api';
import { ReleaseNotes } from '../../features/changelog/components/release-notes';

export const metadata: Metadata = { title: 'Changelog' };
const RECENT = 8;

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showAll = params.show === 'all';
  const isBot = params.project === 'bot';
  const all = (isBot ? await readProjectReleases('bot') : await readChangelog()).filter((release) =>
    release.sections.some((section) => section.items.length),
  );
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <nav aria-label="Changelog project" className="mb-6 flex flex-wrap gap-4">
        <Link href="/changelog" aria-current={isBot ? undefined : 'page'} className="btn btn-ghost">
          Dashboard releases
        </Link>
        <Link href="/changelog?project=bot" aria-current={isBot ? 'page' : undefined} className="btn btn-ghost">
          Bot releases
        </Link>
      </nav>
      {isBot && <h2 className="mb-5 text-xl">Arrakis Control Bot release history</h2>}
      <ReleaseNotes releases={showAll ? all : all.slice(0, RECENT)} />
      {!showAll && all.length > RECENT && (
        <Link href={isBot ? '/changelog?project=bot&show=all' : '/changelog?show=all'} className="btn btn-ghost mt-8">
          Show all {all.length} releases
        </Link>
      )}
    </div>
  );
}
