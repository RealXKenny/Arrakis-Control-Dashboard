import type { Metadata } from 'next';
import Link from 'next/link';
import { loadGuildDirectory } from '../../../server/guilds';
import { requireSession } from '../../../server/session';
import { Notice, PageHeader } from '../_components/page-header';
import { GuildDirectory } from './_components/guild-directory';

export const metadata: Metadata = { title: 'Guilds' };

function pageNumber(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d{1,4}$/.test(raw) ? Number(raw) : 0;
}

export default async function GuildsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const page = pageNumber((await searchParams).page);
  const result = await loadGuildDirectory(session, page);

  return (
    <>
      <PageHeader eyebrow="Community recruitment" title="Guilds">
        {result.status === 'ok' && (
          <p className="font-mono text-xs uppercase tracking-widest text-sand-400">
            {result.rows.length} {result.rows.length === 1 ? 'guild' : 'guilds'} on this page
          </p>
        )}
      </PageHeader>

      {result.status === 'limited' && (
        <Notice tone="warn" title="Slow down, traveller">
          Too many reads from your connection. Try again in {result.retryAfter} seconds.
        </Notice>
      )}
      {result.status === 'unavailable' && (
        <Notice tone="warn" title="Guilds unavailable">
          {result.message}
        </Notice>
      )}
      {result.status === 'ok' && (
        <>
          {result.rows.length === 0 ? (
            <Notice title="No guilds are recruiting here yet">
              Guild leaders can create a listing under My Guild → Settings.
            </Notice>
          ) : (
            <GuildDirectory
              key={`${result.page}:${result.rows.map((row) => row.guildId).join(',')}`}
              entries={result.rows}
              initialStatuses={result.applications}
            />
          )}
          {(result.page > 0 || result.hasMore) && (
            <nav aria-label="Guild listing pages" className="mt-8 flex items-center justify-center gap-4">
              {result.page > 0 ? (
                <Link
                  href={result.page === 1 ? '/guilds' : `/guilds?page=${result.page - 1}`}
                  className="btn btn-ghost"
                >
                  Previous
                </Link>
              ) : (
                <span aria-disabled="true" className="btn btn-ghost opacity-40">
                  Previous
                </span>
              )}
              <span className="font-mono text-xs uppercase tracking-widest text-sand-400">Page {result.page + 1}</span>
              {result.hasMore ? (
                <Link href={`/guilds?page=${result.page + 1}`} className="btn btn-ghost">
                  Next
                </Link>
              ) : (
                <span aria-disabled="true" className="btn btn-ghost opacity-40">
                  Next
                </span>
              )}
            </nav>
          )}
        </>
      )}
    </>
  );
}
