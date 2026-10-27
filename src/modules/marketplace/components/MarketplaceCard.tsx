import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { MarketplaceSummary } from '../schema';

const BaseModelViewer = dynamic(() => import('../../bases/components/BaseModelViewer'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-80 place-items-center rounded-2xl border border-white/5 bg-zinc-950/50 text-sm text-zinc-400">
      Preparing 3D preview…
    </div>
  ),
});

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export default function MarketplaceCard({ listing }: { listing: MarketplaceSummary }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modelUrl = `/api/base-marketplace/${encodeURIComponent(listing.id)}`;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = closeRef.current?.closest('[role="dialog"]');
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), canvas[tabindex]') ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <article className="flex min-h-64 flex-col rounded-3xl border border-white/5 bg-zinc-900/40 p-6 transition-colors hover:bg-zinc-900/60">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{listing.baseType}</p>
          <h3 className="mt-2 truncate text-xl font-semibold tracking-tight text-zinc-100" title={listing.title}>
            {listing.title}
          </h3>
          <p className="mt-1 truncate text-sm text-zinc-400">by {listing.author}</p>
        </div>
        <span className="shrink-0 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-[11px] text-indigo-300">
          Shared
        </span>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-xl border border-white/5 bg-zinc-950/30 p-3">
          <dt className="text-[11px] text-zinc-500">Building pieces</dt>
          <dd className="mt-1 font-medium text-zinc-200">{listing.pieceCount.toLocaleString()}</dd>
        </div>
        <div className="rounded-xl border border-white/5 bg-zinc-950/30 p-3">
          <dt className="text-[11px] text-zinc-500">Placeables</dt>
          <dd className="mt-1 font-medium text-zinc-200">{listing.placeableCount.toLocaleString()}</dd>
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-500">
        <span>{listing.map}</span>
        <time dateTime={listing.publishedAt}>{date.format(new Date(listing.publishedAt))}</time>
      </div>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-auto inline-flex items-center justify-center rounded-full bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
      >
        Inspect base
      </button>

      {open && (
        <div
          role="presentation"
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 p-4 backdrop-blur-sm sm:p-6"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`${listing.title} shared base`}
            className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-white/5 bg-zinc-900/90 p-5 backdrop-blur-md sm:p-6"
          >
            <header className="mb-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-medium tracking-wide text-zinc-500 uppercase">Community blueprint</p>
                <h2 className="mt-1 truncate text-2xl font-semibold text-zinc-100">{listing.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  {listing.pieceCount.toLocaleString()} pieces · {listing.map} · by {listing.author}
                </p>
              </div>
              <button
                ref={closeRef}
                type="button"
                aria-label="Close shared base preview"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-zinc-800 text-xl text-zinc-300 hover:bg-zinc-700"
              >
                ×
              </button>
            </header>
            <BaseModelViewer baseId={listing.id} baseName={listing.title} modelUrl={modelUrl} onSettled={() => {}} />
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
              <p className="text-xs leading-5 text-zinc-500">
                Shared publicly with community members. Download the sanitized layout or inspect it in 3D.
              </p>
              <a
                href={`${modelUrl}?download=1`}
                className="inline-flex shrink-0 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs font-medium text-indigo-300 no-underline hover:bg-indigo-500/15"
              >
                Download layout ↓
              </a>
            </div>
          </section>
        </div>
      )}
    </article>
  );
}
