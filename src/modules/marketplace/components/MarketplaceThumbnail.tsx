import { useEffect, useRef, useState } from 'react';

export default function MarketplaceThumbnail({
  id,
  title,
  publishedAt,
}: {
  id: string;
  title: string;
  publishedAt: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setImage('');
    setFailed(false);
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      void import('../utils/thumbnail')
        .then(({ createMarketplaceThumbnail }) => createMarketplaceThumbnail(id, controller.signal))
        .then((url) => {
          if (!controller.signal.aborted) setImage(url);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    });
    if (host.current) observer.observe(host.current);
    return () => {
      observer.disconnect();
      controller.abort();
    };
  }, [id, publishedAt]);
  return (
    <div
      ref={host}
      className="mt-5 flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-white/5 bg-zinc-950/50"
    >
      {image ? (
        // Browser-generated PNG; no remote image optimizer or persistent private export cache.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={`${title} straight-on base view`}
          width={640}
          height={360}
          className="h-full w-full object-contain"
        />
      ) : (
        <p role="status" className="text-xs text-zinc-500">
          {failed ? 'Base image unavailable' : 'Preparing base image…'}
        </p>
      )}
    </div>
  );
}
