'use client';

import { useState, type ReactNode } from 'react';

/** A sized, session-authenticated image with a stable fallback when storage is unavailable. */
export function AvatarImage({
  src,
  fallback,
  width,
  height,
  className,
}: {
  src: string | null;
  fallback: ReactNode;
  width: number;
  height: number;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return fallback;
  // Use the original same-origin URL so the browser supplies its session cookie.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={width}
      height={height}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className}
      onError={() => setFailed(src)}
    />
  );
}
