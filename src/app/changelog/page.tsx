import type { Metadata } from 'next';
import Link from 'next/link';
import { readChangelog } from '../../features/changelog/server/read';
import { ReleaseNotes } from '../../features/changelog/components/release-notes';

export const metadata: Metadata = { title: 'Changelog' };
const RECENT = 8;

export default async function ChangelogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const showAll = (await searchParams).show === 'all';
  const all = (await readChangelog()).filter((release) => release.sections.some((section) => section.items.length));
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <ReleaseNotes releases={showAll ? all : all.slice(0, RECENT)} />
      {!showAll && all.length > RECENT && (
        <Link href="/changelog?show=all" className="btn btn-ghost mt-8">
          Show all {all.length} releases
        </Link>
      )}
    </div>
  );
}
