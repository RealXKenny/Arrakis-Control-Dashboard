'use client';

import type { CSSProperties } from 'react';
import styles from './casino.module.css';

export function CasinoChip({
  value,
  selected,
  disabled,
  onClick,
}: {
  value: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const color =
    value >= 5000
      ? '#665185'
      : value >= 1000
        ? '#b68d42'
        : value >= 500
          ? '#375e78'
          : value >= 100
            ? '#823b31'
            : value >= 50
              ? '#48674c'
              : '#6b655a';
  const face = (
    <span className={styles.chipFace}>
      <span aria-hidden="true">✧</span>
      <strong>{value >= 1000 ? `${value / 1000}k` : value}</strong>
    </span>
  );
  const style = {
    '--chip-color': color,
    '--chip-ink': value >= 1000 && value < 5000 ? '#191b16' : '#fff1d0',
  } as CSSProperties;
  return onClick ? (
    <button
      type="button"
      className={styles.chip}
      style={style}
      aria-label={`${value.toLocaleString('en-US')} Solaris chip`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
    >
      {face}
    </button>
  ) : (
    <span className={styles.chip} style={style} aria-label={`${value} Solaris`}>
      {face}
    </span>
  );
}
