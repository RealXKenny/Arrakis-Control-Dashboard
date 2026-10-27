import { useEffect, useMemo, useState } from 'react';
import type { MarketplaceSummary } from '../schema';
import MarketplaceCard from './MarketplaceCard';

type SizeFilter = 'all' | 'small' | 'medium' | 'large';

function validListing(value: unknown): value is MarketplaceSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<MarketplaceSummary>;
  return (
    typeof item.id === 'string' &&
    /^[a-f0-9]{24}$/.test(item.id) &&
    typeof item.title === 'string' &&
    typeof item.author === 'string' &&
    typeof item.baseType === 'string' &&
    typeof item.map === 'string' &&
    typeof item.pieceCount === 'number' &&
    Number.isInteger(item.pieceCount) &&
    item.pieceCount > 0 &&
    typeof item.placeableCount === 'number' &&
    Number.isInteger(item.placeableCount) &&
    item.placeableCount >= 0 &&
    typeof item.publishedAt === 'string'
  );
}

export default function BaseMarketplace() {
  const [listings, setListings] = useState<MarketplaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [size, setSize] = useState<SizeFilter>('all');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setLoading(true);
    setError('');
    void fetch('/api/base-marketplace', { signal: controller.signal, cache: 'no-store', credentials: 'same-origin' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error ?? 'Unable to load shared bases.');
        if (!body || !Array.isArray(body.listings)) throw new Error('Unable to load shared bases.');
        if (!controller.signal.aborted) setListings(body.listings.filter(validListing));
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Unable to load shared bases.');
      })
      .finally(() => {
        clearTimeout(timeout);
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [revision]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return listings.filter((listing) => {
      if (size === 'small' && listing.pieceCount >= 500) return false;
      if (size === 'medium' && (listing.pieceCount < 500 || listing.pieceCount > 1500)) return false;
      if (size === 'large' && listing.pieceCount <= 1500) return false;
      return (
        !needle ||
        `${listing.title} ${listing.author} ${listing.baseType} ${listing.map}`.toLowerCase().includes(needle)
      );
    });
  }, [listings, query, size]);
  const totalPieces = listings.reduce((sum, listing) => sum + listing.pieceCount, 0);

  return (
    <div>
      <section className="rounded-3xl border border-white/5 bg-zinc-900/40 p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Community blueprints</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-100">Base Marketplace</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Browse layouts shared by community members, inspect their structures in 3D, and download sanitized
              blueprint data.
            </p>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
            className="rounded-full bg-zinc-800 px-4 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
          >
            {loading ? 'Refreshing…' : 'Refresh listings'}
          </button>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-zinc-950/30 p-4">
            <p className="text-[11px] text-zinc-500">Shared bases</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">{listings.length.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-zinc-950/30 p-4">
            <p className="text-[11px] text-zinc-500">Matching layouts</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">{filtered.length.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-zinc-950/30 p-4">
            <p className="text-[11px] text-zinc-500">Pieces in the marketplace</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-100">{totalPieces.toLocaleString()}</p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <label className="text-xs font-medium text-zinc-400">
            Search by base or author
            <input
              value={query}
              maxLength={120}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, authors, types, or maps"
              className="mt-2 block w-full rounded-xl border border-white/5 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-200 placeholder:text-zinc-600 focus:ring-1 focus:ring-zinc-500 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-zinc-400">
            Base size
            <select
              value={size}
              onChange={(event) => setSize(event.target.value as SizeFilter)}
              className="mt-2 block w-full rounded-full border border-white/5 bg-zinc-800 px-4 py-3 text-sm text-zinc-300 focus:ring-1 focus:ring-zinc-500 focus:outline-none"
            >
              <option value="all">All sizes</option>
              <option value="small">Small · under 500 pieces</option>
              <option value="medium">Medium · 500–1,500 pieces</option>
              <option value="large">Large · over 1,500 pieces</option>
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div role="alert" className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200">
          {error}{' '}
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
            className="ml-2 rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200"
          >
            Try again
          </button>
        </div>
      )}
      {loading && !error && (
        <div
          role="status"
          className="mt-4 rounded-3xl border border-white/5 bg-zinc-900/40 p-10 text-center text-sm text-zinc-400"
        >
          Loading community blueprints…
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <div className="mt-4 rounded-3xl border border-dashed border-white/10 bg-zinc-900/30 p-10 text-center">
          <h3 className="text-base font-medium text-zinc-200">
            {listings.length ? 'No matching bases' : 'No shared bases yet'}
          </h3>
          <p className="mt-2 text-sm text-zinc-400">
            {listings.length
              ? 'Try a different author, title, or size filter.'
              : 'Share one of your bases to start the community marketplace.'}
          </p>
        </div>
      )}
      {!error && filtered.length > 0 && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map((listing) => (
            <MarketplaceCard key={listing.id} listing={listing} />
          ))}
        </div>
      )}
    </div>
  );
}
