import { COLORS, styles } from '../config/colors';
import PortalTabs from '../../../components/tabs/PortalTabs';

export default function LoadingState() {
  return (
      <main
        style={{
          ...styles.page,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          textAlign: 'center',
        }}
      >
        <div>
          <div
            style={{
              width: 34,
              height: 34,
              margin: '0 auto 16px',
              borderRadius: '50%',
              border:
                '2px solid rgba(210,168,90,0.2)',
              borderTopColor:
                COLORS.gold,
              animation:
                'portalSpin 0.9s linear infinite',
              boxShadow:
                `0 0 12px rgba(210,168,90,0.45), 0 0 25px rgba(210,168,90,0.2)`,
            }}
          />

          <p
            style={{
              margin: 0,
              color: COLORS.muted,
              fontSize: '0.9rem',
            }}
          >
            Synchronizing with
            Dune Awakening Console
            telemetry...
          </p>
        </div>

        <style jsx>{`
          @keyframes portalSpin {
            to {
              transform: rotate(360deg);
            }
          }

          @keyframes portalGlow {
            0%,
            100% {
              transform: scale(1);
              opacity: 0.9;
              filter: brightness(1);
            }

            50% {
              transform: scale(1.35);
              opacity: 1;
              filter: brightness(1.6);
            }
          }

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

          .portal-glow-dot {
            animation:
              portalGlow 2.2s ease-in-out infinite;
          }

          .portal-status-dot {
            animation:
              portalGlowStrong 1.8s ease-in-out infinite;
          }
        `}</style>
      </main>
  );
}
