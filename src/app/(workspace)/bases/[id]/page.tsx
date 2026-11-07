import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pieceBreakdown, prettyPieceName } from '../../../../features/bases/schema';
import { loadBaseDetail } from '../../../../server/base-marketplace';
import { requireSession } from '../../../../server/session';
import { Notice } from '../../_components/page-header';
import { Thumbnail } from '../_components/base-card';
import { DeleteButton } from '../_components/delete-button';
import { ImportButton } from '../_components/import-button';

export const metadata: Metadata = { title: 'Base' };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-obsidian-900 p-4">
      <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{label}</dt>
      <dd className="mt-2 text-lg font-extrabold uppercase tracking-wide text-sand-50">{value}</dd>
    </div>
  );
}

export default async function BaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const result = await loadBaseDetail((await params).id, session);

  if (result.status === 'not-found') notFound();
  if (result.status === 'limited') {
    return (
      <Notice tone="warn" title="Slow down, traveller">
        Too many reads from your connection. Try again in {result.retryAfter} seconds.
      </Notice>
    );
  }
  if (result.status === 'unavailable') {
    return (
      <Notice tone="warn" title="Marketplace unavailable">
        {result.message}
      </Notice>
    );
  }

  const { summary, layout } = result.record;
  const pieces = pieceBreakdown(layout);
  const maxCount = pieces[0]?.count ?? 1;

  return (
    <>
      <Link href="/bases" className="eyebrow hover:text-spice-300">
        ← Base Marketplace
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <div className="panel overflow-hidden">
            <Thumbnail summary={summary} className="aspect-[16/10]" />
          </div>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-5">
          <header>
            <p className="eyebrow">Shared by {summary.author}</p>
            <h1 className="mt-3 text-2xl sm:text-3xl">{summary.title}</h1>
            {summary.description && (
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-sand-300">{summary.description}</p>
            )}
          </header>

          <dl className="grid grid-cols-2 gap-px bg-sand-200/10">
            <Stat label="Pieces" value={summary.pieceCount.toLocaleString('en-US')} />
            <Stat label="Placeables" value={summary.placeableCount.toLocaleString('en-US')} />
            <Stat label="Map" value={summary.map} />
            <Stat label="Type" value={summary.baseType} />
          </dl>

          <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
            Published{' '}
            <time dateTime={summary.publishedAt}>
              {new Date(summary.publishedAt).toLocaleDateString('en-US', { dateStyle: 'medium', timeZone: 'UTC' })}
            </time>
          </p>

          <div className="flex flex-wrap items-start gap-4">
            <a href={`/api/v2/bases/marketplace/${summary.id}?download=1`} className="btn btn-primary" download>
              Download layout
            </a>
            <ImportButton id={summary.id} title={summary.title} />
            {result.isOwner && <DeleteButton id={summary.id} />}
          </div>
        </div>
      </div>

      {pieces.length > 0 && (
        <section aria-labelledby="composition" className="panel mt-10 p-6 sm:p-8">
          <h2 id="composition" className="text-base">
            Composition
          </h2>
          <ul className="mt-6 grid gap-x-10 gap-y-4 sm:grid-cols-2">
            {pieces.map((piece) => (
              <li key={piece.type}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-bold uppercase tracking-wide text-sand-200" title={piece.type}>
                    {prettyPieceName(piece.type)}
                  </span>
                  <span className="font-mono text-xs text-spice-400">{piece.count}</span>
                </div>
                <div className="h-1.5 bg-sand-200/10" aria-hidden="true">
                  <div className="h-full bg-spice-500" style={{ width: `${(piece.count / maxCount) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
