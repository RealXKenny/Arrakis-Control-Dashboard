import type { CSSProperties } from 'react';

export const COLORS = {
  page: '#080604',
  pageTop: '#24170d',
  panel: '#1d120c',
  panelLight: '#24170f',
  border: '#503521',
  borderLight: '#ffffff10',
  text: '#ffe2a9',
  textSoft: '#dbc19a',
  muted: '#b9a185',
  dim: '#b29a7d',
  gold: '#d2a85a',
  goldLight: '#cda26b',
  red: '#ff4a4a',
  green: '#52fa7c',
  blue: '#4a90e2',
  water: '#7db8e8',
};

export const styles = {
  panel: {
    background: `linear-gradient(145deg, ${COLORS.panelLight}, ${COLORS.panel})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 4,
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
