'use client';

import Image from 'next/image';

const TILES = [
  { name: '0-0', left: '0%', top: '0%' },
  { name: '1-0', left: '50%', top: '0%' },
  { name: '0-1', left: '0%', top: '50%' },
  { name: '1-1', left: '50%', top: '50%' },
];

export default function TiledMapImage({ mapName, label, hidden }: { mapName: string; label: string; hidden: boolean }) {
  const slug = mapName === 'DeepDesert' ? 'deep-desert' : 'hagga-basin';

  return (
    <div
      role="img"
      aria-label={label}
      data-map-tiles={slug}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        opacity: hidden ? 0 : 1,
        pointerEvents: 'none',
      }}
    >
      {TILES.map((tile, index) => (
        <Image
          key={tile.name}
          unoptimized
          loading="eager"
          fetchPriority={index === 0 ? 'high' : 'auto'}
          width={4096}
          height={4096}
          src={`/maps/${slug}/${tile.name}.webp`}
          alt=""
          aria-hidden="true"
          draggable={false}
          style={{
            position: 'absolute',
            left: tile.left,
            top: tile.top,
            width: '50%',
            height: '50%',
            display: 'block',
            objectFit: 'fill',
            userSelect: 'none',
          }}
        />
      ))}
    </div>
  );
}
