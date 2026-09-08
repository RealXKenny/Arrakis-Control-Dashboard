import Image from 'next/image';
import { useState } from 'react';
import css from '../item-image.module.css';
export default function ItemImage({ src, large = false }: { src: string | null; large?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`${css.frame} ${large ? css.large : ''}`} aria-hidden="true">
      {src && failed !== src ? (
        <Image
          src={src}
          alt=""
          width={large ? 112 : 56}
          height={large ? 112 : 56}
          unoptimized
          onError={() => setFailed(src)}
        />
      ) : (
        <span className={css.fallback} title="Item image unavailable">
          ◇
        </span>
      )}
    </span>
  );
}
