import type { CSSProperties } from "react";

export const COLORS = {
  page: "#080604",
  pageTop: "#24170d",
  panel: "#1d120c",
  panelLight: "#24170f",
  border: "#3c2415",
  borderLight: "#ffffff10",
  text: "#ffe2a9",
  textSoft: "#dbc19a",
  muted: "#a08568",
  dim: "#7f6953",
  gold: "#d2a85a",
  goldLight: "#cda26b",
  red: "#ff4a4a",
  green: "#52fa7c",
  blue: "#4a90e2",
  water: "#7db8e8",
};


export const styles = {
  page: {
    minHeight: "100vh",
    width: "100%",
    maxWidth: 2280,
    margin: "0 auto",
    boxSizing: "border-box",
    padding: "40px 0 70px",
    background: `
      radial-gradient(
        circle at 50% -10%,
        ${COLORS.pageTop} 0%,
        #120b07 42%,
        ${COLORS.page} 80%
      )
    `,
    color: COLORS.text,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  container: {
    width: "calc(100% - clamp(24px, 3vw, 64px))",
    margin: "0 auto",
  },

  panel: {
    background: `linear-gradient(145deg, ${COLORS.panelLight}, ${COLORS.panel})`,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 14,
    boxSizing: "border-box",
    boxShadow: "0 12px 40px rgba(0, 0, 0, 0.18)",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontFamily: "Georgia, serif",
    fontWeight: 600,
    color: COLORS.text,
  },

  muted: {
    color: COLORS.muted,
  },

  progressTrack: {
    width: "100%",
    height: 6,
    backgroundColor: "#ffffff0a",
    borderRadius: 999,
    overflow: "hidden",
  },
} satisfies Record<string, CSSProperties>;
