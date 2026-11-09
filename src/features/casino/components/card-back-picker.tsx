'use client';

import { useEffect, useState } from 'react';
import { CARD_BACKS, type CardBack, PlayingCard } from './playing-card';

export function useCardBack() {
  const [back, setBack] = useState<CardBack>('Imperial Gold');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('casino-card-back');
      if (CARD_BACKS.includes(saved as CardBack)) setBack(saved as CardBack);
    } catch {
      /* defaults */
    }
  }, []);
  const choose = (value: CardBack) => {
    setBack(value);
    try {
      localStorage.setItem('casino-card-back', value);
    } catch {
      /* session only */
    }
  };
  return { back, choose };
}
export function CardBackPicker({ back, onChange }: { back: CardBack; onChange: (value: CardBack) => void }) {
  return (
    <details className="text-xs text-sand-300">
      <summary className="cursor-pointer py-2">Card back · {back}</summary>
      <div className="flex flex-wrap gap-3 py-3" role="group" aria-label="Card back design">
        {CARD_BACKS.map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={back === value}
            onClick={() => onChange(value)}
            className="flex flex-col items-center gap-2 border border-sand-200/20 p-2 aria-pressed:border-spice-400"
          >
            <PlayingCard id={null} back={value} dealing={false} />
            <span>{value}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
