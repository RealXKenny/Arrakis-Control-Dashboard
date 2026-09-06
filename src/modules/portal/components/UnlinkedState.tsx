import { COLORS, styles } from "../config/colors";
import PortalTabs from "../../../components/tabs/PortalTabs";
import Link from "next/link";

export default function UnlinkedState() {
  return (
    <main style={styles.page}>
      <PortalTabs activeTab="Character" />

      <div style={styles.container}>
        <div
          style={{
            ...styles.panel,
            padding: 36,
            textAlign: "center",
            marginTop: 20,
          }}
        >
          <div
            style={{
              width: 52,
              height: 52,
              margin: "0 auto 18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              backgroundColor: "rgba(255,74,74,0.08)",
              border: "1px solid rgba(255,74,74,0.2)",
              color: COLORS.red,
              fontSize: "1.3rem",
              boxShadow: `0 0 12px rgba(255,74,74,0.35), 0 0 28px rgba(255,74,74,0.12)`,
            }}
          >
            !
          </div>

          <b
            style={{
              color: COLORS.red,
              fontSize: "1.2rem",
              display: "block",
              marginBottom: 10,
            }}
          >
            No Linked Dune Character Found
          </b>

          <p
            style={{
              color: COLORS.muted,
              margin: 0,
              lineHeight: 1.7,
              maxWidth: 600,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Please link your character in-game or via the Discord server integrations panel first.
          </p>

          <Link
            href="/"
            style={{
              display: "inline-block",
              marginTop: 22,
              color: COLORS.goldLight,
              textDecoration: "none",
              padding: "9px 16px",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 7,
              backgroundColor: COLORS.panel,
              fontSize: "0.82rem",
              fontWeight: 600,
            }}
          >
            ← Return Home
          </Link>
        </div>
      </div>

      <style jsx>{`
        @keyframes portalGlowStrong {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.85;
          }

          50% {
            transform: scale(1.4);
            opacity: 1;
          }
        }

        .portal-status-dot {
          animation: portalGlowStrong 1.8s ease-in-out infinite;
        }
      `}</style>
    </main>
  );
}
