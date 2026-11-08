import type { Metadata } from 'next';
import Link from 'next/link';
import { BASE_SORTS, baseBrowseHref, parseBaseQuery } from '../../../features/bases/browse';
import { loadBaseBrowse } from '../../../features/bases/server/marketplace';
import { requireSession } from '../../../features/auth/server/session';
import { ArrowRightIcon, UploadIcon } from '../../../components/icons';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { BaseCard } from '../../../features/bases/components/marketplace/base-card';

export const metadata: Metadata = { title: 'Base Marketplace' };

const SORT_LABELS = { newest: 'Newest', pieces: 'Most pieces' } as const;
const FIELD =
  'h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sm font-normal normal-case tracking-normal text-sand-50';
const LABEL = 'grid gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400';

export default async function BaseMarketplacePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = parseBaseQuery(await searchParams);
  const result = await loadBaseBrowse(query, session);

  return (
    <>
      <PageHeader eyebrow="Community" title="Base Marketplace">
        <Link href="/bases/upload" className="btn btn-primary">
          <UploadIcon className="size-4" />
          Share a base
        </Link>
      </PageHeader>

      {result.status === 'limited' && (
        <Notice tone="warn" title="Slow down, traveller">
          Too many reads from your connection. Try again in {result.retryAfter} seconds.
        </Notice>
      )}
      {result.status === 'unavailable' && (
        <Notice tone="warn" title="Marketplace unavailable">
          {result.message}
        </Notice>
      )}

      {result.status === 'ok' && (
        <>
          <form action="/bases" method="get" className="mb-8 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
            <label className={LABEL}>
              Search
              <input
                type="search"
                name="q"
                defaultValue={query.q}
                maxLength={128}
                placeholder="Title, author, map or type"
                className={`${FIELD} placeholder:text-sand-600`}
              />
            </label>
            <label className={LABEL}>
              Map
              <select name="map" defaultValue={query.map} className={FIELD}>
                <option value="">All maps</option>
                {result.data.maps.map((map) => (
                  <option key={map} value={map}>
                    {map}
                  </option>
                ))}
              </select>
            </label>
            <label className={LABEL}>
              Sort
              <select name="sort" defaultValue={query.sort} className={FIELD}>
                {BASE_SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn btn-primary self-end">
              Apply
            </button>
          </form>

          {result.data.listings.length === 0 ? (
            <div className="panel flex flex-col items-start gap-4 p-8">
              <p className="eyebrow">{query.q || query.map ? 'No matches' : 'Nothing shared yet'}</p>
              <p className="max-w-prose text-sm text-sand-300">
                {query.q || query.map
                  ? 'No bases match those filters. Try widening your search.'
                  : 'Be the first to share a base layout with the community.'}
              </p>
              <Link href="/bases/upload" className="btn btn-primary">
                Share a base <ArrowRightIcon className="size-4" />
              </Link>
            </div>
          ) : (
            <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {result.data.listings.map((summary) => (
                <li key={summary.id} className="min-w-0">
                  <BaseCard summary={summary} mine={result.viewerKeys.includes(summary.ownerKey ?? '')} />
                </li>
              ))}
            </ul>
          )}

          <nav aria-label="Marketplace pages" className="mt-10 flex items-center justify-between gap-4">
            {result.data.page > 1 ? (
              <Link href={baseBrowseHref(query, { page: result.data.page - 1 })} rel="prev" className="btn btn-ghost">
                Previous
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <span aria-live="polite" className="font-mono text-xs uppercase tracking-widest text-sand-400">
              {result.data.total} bases · Page {result.data.page} of {result.data.pageCount}
            </span>
            {result.data.page < result.data.pageCount ? (
              <Link href={baseBrowseHref(query, { page: result.data.page + 1 })} rel="next" className="btn btn-ghost">
                Next
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
          </nav>
        </>
      )}
    </>
  );
}
