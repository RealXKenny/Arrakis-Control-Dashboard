import type { Metadata } from 'next';
import Link from 'next/link';
import { MARKET_OWNERS, MARKET_SORTS, marketHref, parseMarketQuery } from '../../../features/market/normalize';
import { formatDecimal } from '../../../lib/format';
import { loadMarket } from '../../../features/market/server/load';
import { requireSession } from '../../../features/auth/server/session';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { MarketGrid } from '../../../features/market/components/market-grid';

export const metadata: Metadata = { title: 'Market' };

const SORT_LABELS = { listed: 'Most listed', price: 'Lowest price', name: 'Name' } as const;
const OWNER_LABELS = { all: 'All listings', mine: 'My listings' } as const;

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = parseMarketQuery(await searchParams);
  const result = await loadMarket(query, session);

  return (
    <>
      <PageHeader eyebrow="CHOAM exchange" title="Market">
        {result.status === 'ok' && (
          <p className="font-mono text-xs uppercase tracking-widest text-sand-400">
            {formatDecimal(String(result.data.total))} listings
          </p>
        )}
      </PageHeader>

      {/* Plain GET form: search, sort and filter live in the URL, so no client JS is needed. */}
      <form action="/market" method="get" className="mb-8 grid gap-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <label className="grid gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400">
          Search
          <input
            type="search"
            name="q"
            defaultValue={query.q}
            maxLength={128}
            placeholder="Item, category or template ID"
            className="h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sm font-normal normal-case tracking-normal text-sand-50 placeholder:text-sand-600"
          />
        </label>
        <label className="grid gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400">
          Sort
          <select
            name="sort"
            defaultValue={query.sort}
            className="h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sm font-normal normal-case tracking-normal text-sand-50"
          >
            {MARKET_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-sand-400">
          Show
          <select
            name="owner"
            defaultValue={query.owner}
            className="h-11 border border-sand-200/20 bg-obsidian-900 px-3 text-sm font-normal normal-case tracking-normal text-sand-50"
          >
            {MARKET_OWNERS.map((owner) => (
              <option key={owner} value={owner}>
                {OWNER_LABELS[owner]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary self-end">
          Apply
        </button>
      </form>

      {result.status === 'limited' && (
        <Notice tone="warn" title="Slow down, traveller">
          Too many market reads from your connection. Try again in {result.retryAfter} seconds.
        </Notice>
      )}
      {result.status === 'unavailable' && (
        <Notice tone="warn" title="Market unavailable">
          {result.message}
        </Notice>
      )}
      {result.status === 'ok' && (
        <>
          {result.data.items.length === 0 && (
            <div className="mb-6">
              <Notice title="No matching listings">Adjust the search or filters to see more of the market.</Notice>
            </div>
          )}
          <MarketGrid items={result.data.items} />
          <nav aria-label="Market pages" className="mt-8 flex items-center justify-between gap-4">
            {result.data.page > 1 ? (
              <Link href={marketHref(query, { page: result.data.page - 1 })} rel="prev" className="btn btn-ghost">
                Previous
              </Link>
            ) : (
              <span aria-hidden="true" />
            )}
            <span aria-live="polite" className="font-mono text-xs uppercase tracking-widest text-sand-400">
              Page {result.data.page} of {result.data.pageCount}
            </span>
            {result.data.page < result.data.pageCount ? (
              <Link href={marketHref(query, { page: result.data.page + 1 })} rel="next" className="btn btn-ghost">
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
