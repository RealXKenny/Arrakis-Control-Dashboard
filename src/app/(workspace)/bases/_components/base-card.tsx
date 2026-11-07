import Image from 'next/image';
import Link from 'next/link';
import { summaryHasThumbnail, type BaseSummary } from '../../../../features/bases/schema';
import { BaseIcon } from '../../../_components/icons';

export function baseImageSrc(summary: BaseSummary): string {
  const version = summary.previewRevision ?? Date.parse(summary.publishedAt);
  return `/api/v2/bases/marketplace/${summary.id}/image?v=${version}`;
}

export function Thumbnail({ summary, className = '' }: { summary: BaseSummary; className?: string }) {
  return (
    <div className={`relative flex items-center justify-center overflow-hidden bg-obsidian-900 ${className}`}>
      {summaryHasThumbnail(summary) ? (
        <Image
          src={baseImageSrc(summary)}
          alt={`Picture of ${summary.title}`}
          fill
          unoptimized
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover"
        />
      ) : (
        <BaseIcon aria-hidden="true" className="size-12 text-sand-700" />
      )}
    </div>
  );
}

export function BaseCard({ summary, mine }: { summary: BaseSummary; mine: boolean }) {
  return (
    <Link href={`/bases/${summary.id}`} className="panel panel-interactive group flex h-full flex-col">
      <Thumbnail summary={summary} className="aspect-[16/10] border-b border-sand-200/10" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 text-sm leading-snug tracking-wide">{summary.title}</h3>
          {mine && (
            <span className="shrink-0 border border-spice-500/50 px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold uppercase tracking-widest text-spice-300">
              Yours
            </span>
          )}
        </div>
        <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">
          By <span className="text-sand-300">{summary.author}</span>
        </p>
        <dl className="mt-auto flex flex-wrap gap-x-4 gap-y-1 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
          <div className="flex gap-1.5">
            <dt className="text-sand-600">Pieces</dt>
            <dd className="font-semibold text-spice-400">{summary.pieceCount.toLocaleString('en-US')}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">Map</dt>
            <dd>{summary.map}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="sr-only">Type</dt>
            <dd>{summary.baseType}</dd>
          </div>
        </dl>
      </div>
    </Link>
  );
}
