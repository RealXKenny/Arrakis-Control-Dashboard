import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { MarketplaceListing } from '../schema';
import type { BaseCapture } from '../../bases/components/BaseModelViewer';
import MarketplaceThumbnail from './MarketplaceThumbnail';
import MarketplaceImport from './MarketplaceImport';

const BaseModelViewer = dynamic(() => import('../../bases/components/BaseModelViewer'), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-80 place-items-center rounded-2xl border border-white/5 bg-zinc-950/50 text-sm text-zinc-400">
      Preparing 3D preview…
    </div>
  ),
});

const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });

export default function MarketplaceCard({
  listing,
  onPictureSaved,
}: {
  listing: MarketplaceListing;
  onPictureSaved?: (revision: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [capture, setCapture] = useState<BaseCapture | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const saveRef = useRef<AbortController | null>(null);
  const settled = useCallback(() => {}, []);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const modelUrl = `/api/base-marketplace/${encodeURIComponent(listing.id)}`;

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : triggerRef.current;
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
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), canvas[tabindex]',
        ) ?? [],
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
      saveRef.current?.abort();
      trigger?.focus();
    };
  }, [open]);

  async function savePicture() {
    if (!capture || !listing.editableBaseId || saving) return;
    const controller = new AbortController();
    saveRef.current = controller;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/bases/${encodeURIComponent(listing.editableBaseId)}/preview`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capture),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
      });
      const body = await response.json();
      if (!response.ok || typeof body.revision !== 'string' || !/^[a-f0-9]{24}$/.test(body.revision)) throw new Error();
      onPictureSaved?.(body.revision);
      setOpen(false);
    } catch {
      if (!controller.signal.aborted) setError('Could not save the picture. Please try again.');
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

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
      <MarketplaceThumbnail id={listing.id} title={listing.title} previewRevision={listing.previewRevision} />
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
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
      <div className="mt-auto flex items-start gap-2 pt-4">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setEditing(false);
            setOpen(true);
          }}
          className="inline-flex flex-1 items-center justify-center rounded-full bg-zinc-800 px-4 py-2.5 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100"
        >
          Inspect base
        </button>
        {listing.previewRevision && (
          <MarketplaceImport key={`${listing.id}:${listing.publishedAt}`} id={listing.id} title={listing.title} />
        )}
      </div>
      {listing.editableBaseId && (
        <button
          type="button"
          onClick={() => {
            setEditing(true);
            setCapture(null);
            setError('');
            setSaving(false);
            setOpen(true);
          }}
          className="mt-3 self-start rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-xs text-indigo-200"
        >
          Change picture
        </button>
      )}

      {open && (
        <div
          role="presentation"
          onMouseDown={() => setOpen(false)}
          className="fixed inset-0 z-[1000] grid place-items-center bg-black/40 p-4 backdrop-blur-sm sm:p-6"
        >
          <section
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${listing.title} ${editing ? 'change picture' : 'shared base'}`}
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
            {editing && (
              <p className="mb-4 text-sm text-zinc-400">
                Choose the front of this published layout, then take a picture. The whole base fits inside the image;
                your listing and blueprint stay in place.
              </p>
            )}
            <BaseModelViewer
              baseId={listing.id}
              baseName={listing.title}
              modelUrl={modelUrl}
              onSettled={settled}
              onCapture={editing ? setCapture : undefined}
            />
            {editing && (
              <div className="mt-4">
                {capture && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={capture.image}
                      width={640}
                      height={360}
                      alt="New base picture"
                      className="mb-4 h-auto max-w-full rounded-xl"
                    />
                  </>
                )}
                <button
                  type="button"
                  disabled={!capture || saving}
                  onClick={() => void savePicture()}
                  className="rounded-full bg-indigo-500/20 px-4 py-2 text-sm text-indigo-200 disabled:opacity-50"
                >
                  {saving ? 'Saving picture…' : 'Save picture'}
                </button>
                {error && (
                  <p role="alert" className="mt-2 text-sm text-red-300">
                    {error}
                  </p>
                )}
              </div>
            )}
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
