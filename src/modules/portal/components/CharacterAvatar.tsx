import Image from 'next/image';
import { useState } from 'react';
import css from '../dossier.module.css';
export default function CharacterAvatar({ src, name }: { src?: string | null; name: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={css.avatar}>
      {src && failed !== src ? (
        <Image
          src={src}
          alt={`${name}'s Discord avatar`}
          width={64}
          height={64}
          unoptimized
          onError={() => setFailed(src)}
        />
      ) : (
        <span aria-hidden="true">{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
