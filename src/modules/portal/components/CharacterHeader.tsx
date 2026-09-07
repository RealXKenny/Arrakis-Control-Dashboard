import { COLORS } from "../config/colors";
import Link from "next/link";

export default function CharacterHeader({ character, isOnline }) {
  return (
    <>
      {/* Top status bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 15,
          marginBottom: 32,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 13px",
            borderRadius: 999,
            backgroundColor: isOnline ? "rgba(82,250,124,0.07)" : "rgba(255,74,74,0.07)",
            border: `1px solid ${isOnline ? "rgba(82,250,124,0.2)" : "rgba(255,74,74,0.2)"}`,
          }}
        >
          {/* GLOWING ONLINE DOT */}
          <span
            className="portal-status-dot"
            style={{
              width: 8,
              height: 8,
              flexShrink: 0,
              borderRadius: "50%",
              backgroundColor: isOnline ? COLORS.green : COLORS.red,
              boxShadow: isOnline
                ? `
                      0 0 4px ${COLORS.green},
                      0 0 9px ${COLORS.green},
                      0 0 18px ${COLORS.green},
                      0 0 30px ${COLORS.green}
                    `
                : `
                      0 0 4px ${COLORS.red},
                      0 0 9px ${COLORS.red},
                      0 0 18px ${COLORS.red},
                      0 0 30px ${COLORS.red}
                    `,
            }}
          />

          <span
            style={{
              color: isOnline ? "#8fffa9" : "#e58b8b",
              fontWeight: 700,
              fontSize: "0.72rem",
              textTransform: "uppercase",
              letterSpacing: "0.7px",
            }}
          >
            {character.status}
          </span>
        </div>

        <Link
          href="/api/auth/logout"
          style={{
            backgroundColor: COLORS.panel,
            color: COLORS.goldLight,
            border: `1px solid ${COLORS.border}`,
            padding: "8px 15px",
            borderRadius: 7,
            textDecoration: "none",
            fontSize: "0.78rem",
            fontWeight: 700,
          }}
        >
          Sign out
        </Link>
      </div>

      {/* Character heading */}
      <div
        style={{
          marginBottom: 26,
        }}
      >
        <p
          style={{
            textTransform: "uppercase",
            letterSpacing: 2.5,
            color: COLORS.goldLight,
            fontSize: "0.72rem",
            fontWeight: 600,
            margin: "0 0 7px",
          }}
        >
          Arrakis Survivor Log
        </p>

        <h1
          style={{
            fontSize: "clamp(2rem, 7vw, 3rem)",
            margin: 0,
            fontFamily: "Georgia, serif",
            color: COLORS.text,
            lineHeight: 1.05,
            wordBreak: "break-word",
          }}
        >
          {character.name}
        </h1>

        <p
          style={{
            color: COLORS.muted,
            fontSize: "0.78rem",
            margin: "9px 0 0",
          }}
        >
          Guild: {character.guild?.guild_name ?? character.guild?.guildName ?? character.guild?.name ?? "No guild"}
        </p>
      </div>
    </>
  );
}
