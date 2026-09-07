"use client";

import { useServerStatus } from "../hooks/useServerStatus";

export default function LandingPage() {
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();

  const serverOnline = !serverStatusError;

  return (
    <main
      style={{
        minHeight: "100vh",
        width: "100%",
        boxSizing: "border-box",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        color: "#f3d39b",
        background: "radial-gradient(circle at 50% 0%, #3b2515 0%, #1b110a 32%, #0d0805 65%, #060403 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: "900px",
          height: "900px",
          top: "-550px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "radial-gradient(circle, rgba(205,162,107,0.14) 0%, rgba(205,162,107,0.04) 35%, transparent 70%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "50%",
          height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(205,162,107,0.05), transparent)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: "1000px",
        }}
      >
        <header
          style={{
            textAlign: "center",
            marginBottom: "35px",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "9px",
              padding: "7px 14px",
              marginBottom: "18px",
              border: "1px solid rgba(205,162,107,0.22)",
              borderRadius: "999px",
              backgroundColor: "rgba(29,18,12,0.65)",
              backdropFilter: "blur(10px)",
              color: "#a08568",
              fontSize: "0.7rem",
              fontWeight: "700",
              letterSpacing: "2px",
              textTransform: "uppercase",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                backgroundColor: "#52fa7c",
                boxShadow: "0 0 12px rgba(82,250,124,0.8)",
              }}
            />
            Arrakis Control
          </div>

          <h1
            style={{
              margin: 0,
              color: "#ffe2a9",
              fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              fontSize: "clamp(2.5rem, 7vw, 4.6rem)",
              fontWeight: "750",
              lineHeight: 1,
              letterSpacing: "-3px",
              textShadow: "0 5px 35px rgba(0,0,0,0.55)",
            }}
          >
            Dune: Awakening
          </h1>

          <div
            style={{
              marginTop: "12px",
              color: "#cda26b",
              fontSize: "clamp(0.7rem, 2vw, 0.9rem)",
              fontWeight: "600",
              letterSpacing: "5px",
              textTransform: "uppercase",
            }}
          >
            Console Interface
          </div>

          <p
            style={{
              maxWidth: "650px",
              margin: "22px auto 0",
              color: "#9f8265",
              fontSize: "0.95rem",
              lineHeight: "1.8",
            }}
          >
            Secure access gateway for character telemetry, Discord infrastructure, and live server intelligence across Arrakis.
          </p>
        </header>

        <section
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            background: "linear-gradient(135deg, rgba(29,18,12,0.94), rgba(14,8,5,0.97))",
            border: "1px solid rgba(205,162,107,0.18)",
            borderRadius: "18px",
            overflow: "hidden",
            boxShadow: "0 30px 90px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.025)",
            backdropFilter: "blur(16px)",
          }}
        >
          <div
            style={{
              padding: "55px 45px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              borderRight: "1px solid rgba(205,162,107,0.10)",
              background: "radial-gradient(circle at center, rgba(205,162,107,0.055), transparent 65%)",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "9px",
                color: serverOnline ? "#9d8468" : "#b56d61",
                fontSize: "0.68rem",
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: "2px",
              }}
            >
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: serverOnline ? "#52fa7c" : "#ff4a4a",
                  boxShadow: serverOnline ? "0 0 14px rgba(82,250,124,0.85)" : "0 0 14px rgba(255,74,74,0.75)",
                }}
              />
              {serverOnline ? "Server Systems Online" : "Status Unavailable"}
            </div>

            <div
              style={{
                marginTop: "22px",
                color: "#ffe2a9",
                fontSize: "clamp(4rem, 10vw, 6.5rem)",
                lineHeight: 0.95,
                fontWeight: "800",
                letterSpacing: "-5px",
                textShadow: "0 0 45px rgba(205,162,107,0.12)",
              }}
            >
              {serverStatusError ? "—" : activePlayers === null ? "..." : activePlayers.toLocaleString()}
            </div>

            <div
              style={{
                marginTop: "14px",
                color: "#cda26b",
                fontSize: "0.72rem",
                fontWeight: "800",
                textTransform: "uppercase",
                letterSpacing: "2.5px",
              }}
            >
              Active Players
            </div>

            <div
              style={{
                width: "100%",
                maxWidth: "260px",
                height: "1px",
                margin: "25px 0",
                background: "linear-gradient(90deg, transparent, #3b2819, transparent)",
              }}
            />

            <div
              style={{
                color: "#f3d39b",
                fontSize: "1.8rem",
                lineHeight: 1,
                fontWeight: "750",
                letterSpacing: "-1px",
              }}
            >
              {serverStatusError ? "—" : totalPlayers === null ? "..." : totalPlayers.toLocaleString()}
            </div>

            <div
              style={{
                marginTop: "8px",
                color: "#9a7959",
                fontSize: "0.68rem",
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: "1.8px",
              }}
            >
              Total Players
            </div>

            <div
              style={{
                marginTop: "6px",
                color: "#493522",
                fontSize: "0.62rem",
              }}
            >
              All registered players
            </div>

            <div
              style={{
                marginTop: "22px",
                color: "#493522",
                fontSize: "0.62rem",
              }}
            >
              Live telemetry • Refreshes every 15 seconds
            </div>
          </div>

          <div
            style={{
              padding: "55px 45px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "46px",
                height: "46px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "20px",
                border: "1px solid #49301c",
                borderRadius: "12px",
                backgroundColor: "#160d08",
                color: "#cda26b",
                fontSize: "1.15rem",
                boxShadow: "0 8px 25px rgba(0,0,0,0.25)",
              }}
            >
              ◈
            </div>

            <div
              style={{
                color: "#5f4631",
                fontSize: "0.68rem",
                fontWeight: "700",
                letterSpacing: "2px",
                textTransform: "uppercase",
                marginBottom: "10px",
              }}
            >
              Secure Gateway
            </div>

            <h2
              style={{
                margin: "0 0 13px",
                color: "#f3d39b",
                fontSize: "1.8rem",
                fontWeight: "700",
                letterSpacing: "-0.8px",
              }}
            >
              Enter the Imperium
            </h2>

            <p
              style={{
                maxWidth: "360px",
                margin: "0 0 28px",
                color: "#846a50",
                fontSize: "0.86rem",
                lineHeight: "1.75",
              }}
            >
              Authenticate with Discord to access your character telemetry, player portal, and authorized Arrakis systems.
            </p>

            {/* OAuth starts a full browser navigation; Next Link prefetch can replace login state. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/auth/login"
              style={{
                width: "100%",
                maxWidth: "280px",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                padding: "14px 24px",
                borderRadius: "8px",
                background: "linear-gradient(135deg, #d7ad73 0%, #b9844a 100%)",
                color: "#130b06",
                textDecoration: "none",
                fontSize: "0.88rem",
                fontWeight: "800",
                boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
                transition: "transform 0.2s ease, filter 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.filter = "brightness(1.08)";
                e.currentTarget.style.boxShadow = "0 14px 35px rgba(0,0,0,0.45)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.filter = "brightness(1)";
                e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.35)";
              }}
            >
              <span>Continue with Discord</span>
              <span style={{ fontSize: "1.1rem" }}>→</span>
            </a>

            <a
              href="https://discord.gg/crimsonskies"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                width: "100%",
                maxWidth: "280px",
                boxSizing: "border-box",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "12px",
                marginTop: "12px",
                padding: "13px 24px",
                borderRadius: "8px",
                border: "1px solid rgba(205,162,107,0.25)",
                backgroundColor: "rgba(205,162,107,0.06)",
                color: "#cda26b",
                textDecoration: "none",
                fontSize: "0.88rem",
                fontWeight: "800",
                boxShadow: "0 8px 25px rgba(0,0,0,0.2)",
                transition: "transform 0.2s ease, background-color 0.2s ease, border-color 0.2s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.backgroundColor = "rgba(205,162,107,0.12)";
                e.currentTarget.style.borderColor = "rgba(205,162,107,0.4)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.backgroundColor = "rgba(205,162,107,0.06)";
                e.currentTarget.style.borderColor = "rgba(205,162,107,0.25)";
              }}
            >
              <span style={{ fontSize: "1.05rem" }}>◈</span>
              <span>Join Discord</span>
              <span style={{ fontSize: "1rem" }}>↗</span>
            </a>

            <div
              style={{
                marginTop: "16px",
                color: "#493522",
                fontSize: "0.62rem",
              }}
            >
              Access controlled by server permissions
            </div>
          </div>

          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: "20%",
              right: "20%",
              height: "1px",
              background: "linear-gradient(90deg, transparent, rgba(205,162,107,0.4), transparent)",
            }}
          />
        </section>

        <footer
          style={{
            marginTop: "25px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "18px",
            flexWrap: "wrap",
            color: "#493522",
            fontSize: "0.62rem",
            textTransform: "uppercase",
            letterSpacing: "1.4px",
          }}
        >
          <span>Arrakis Control</span>
          <span style={{ color: "#2d1d11" }}>•</span>
          <span>Modular Telemetry Architecture</span>
          <span style={{ color: "#2d1d11" }}>•</span>
          <span>Telemetry Online</span>
        </footer>
      </div>

      <style jsx>{`
@media(max - width: 700px) {
          main {
    padding: 30px 15px!important;
  }

          section {
    grid - template - columns: 1fr!important;
  }

  section > div: first - child {
    border - right: none!important;
    border - bottom: 1px solid rgba(205, 162, 107, 0.1);
  }
}

@media(max - height: 750px) and(min - width: 701px) {
          main {
    padding - top: 25px!important;
    padding - bottom: 25px!important;
  }

          header {
    margin - bottom: 20px!important;
  }

  section > div {
    padding - top: 35px!important;
    padding - bottom: 35px!important;
  }
}
`}</style>
    </main>
  );
}
