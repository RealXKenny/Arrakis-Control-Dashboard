import type { CSSProperties } from 'react';

export const COLORS = {
  page: 'var(--theme-background)',
  pageTop: 'var(--theme-raised)',
  panel: 'var(--theme-surface)',
  panelLight: 'var(--theme-surface)',
  border: 'var(--theme-border)',
  borderLight: '#ffffff10',
  text: 'var(--theme-text)',
  textSoft: 'var(--theme-soft)',
  muted: 'var(--theme-muted)',
  dim: 'var(--theme-muted)',
  gold: 'var(--theme-accent)',
  goldLight: 'var(--theme-accent)',
  red: 'var(--theme-danger)',
  green: 'var(--theme-success)',
  blue: 'var(--theme-muted)',
  water: 'var(--theme-soft)',
};

export const styles = {
  panel: {
    background: `linear-gradient(145deg, ${COLORS.panelLight}, ${COLORS.panel})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 12,
    boxSizing: 'border-box',
    boxShadow: '0 12px 40px rgba(0, 0, 0, 0.18)',
  },

  sectionTitle: {
    margin: 0,
    fontSize: '1.25rem',
    fontFamily: 'inherit',
    fontWeight: 600,
    color: COLORS.text,
  },

  progressTrack: {
    width: '100%',
    height: 6,
    backgroundColor: '#ffffff0a',
    borderRadius: 999,
    overflow: 'hidden',
  },
} satisfies Record<string, CSSProperties>;
