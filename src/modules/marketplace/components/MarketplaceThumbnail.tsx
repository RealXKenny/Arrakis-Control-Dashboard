import { useState } from 'react';

export default function MarketplaceThumbnail({
  id,
  title,
  previewRevision,
}: {
  id: string;
  title: string;
  previewRevision?: string;
}) {
  const [failedRevision, setFailedRevision] = useState('');
  return (
    <div className="mt-5 flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/50">
      {previewRevision && failedRevision !== previewRevision ? (
        // Owner-captured PNG: cards never download building models or allocate WebGL contexts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/base-marketplace/${encodeURIComponent(id)}?image=1&v=${previewRevision}`}
          alt={`${title} front picture`}
          width={640}
          height={360}
          loading="lazy"
          className="h-full w-full object-contain"
          onError={() => setFailedRevision(previewRevision)}
        />
      ) : (
        <p role="status" className="px-5 text-center text-xs text-zinc-400">
          {previewRevision
            ? 'Base picture unavailable'
            : 'Picture required — the owner must choose a front and take a picture in My bases.'}
        </p>
      )}
    </div>
  );
}
