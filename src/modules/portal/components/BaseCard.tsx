import { COLORS } from "../config/colors";
import { clampPercent, formatStorage, formatVolume } from "../utils/formatting";
import { getBaseId, getBaseName, getBaseOwner, getBaseRelationship, getBaseType, getGeneratorSeconds, getMaxGeneratorUptimeSeconds, getStorageData, getWaterData, isOwnedBase } from "../utils/bases";
import { getPowerColor, getStorageColor, getWaterColor } from "../utils/progression";
import TelemetryMetric from "./TelemetryMetric";

export default function BaseCard({ base, index, telemetry }) {
  const baseId = getBaseId(base);
  const baseName = getBaseName(base, index);
  const baseType = getBaseType(base);
  const owner = getBaseOwner(base);
  const relationship = getBaseRelationship(base);

  const inventory = telemetry?.inventory ?? base?.inventory ?? base?.inventoryData ?? base;

  const water = telemetry?.water ?? base?.water ?? base?.waterData ?? base;

  const runtimeSeconds = getGeneratorSeconds(base);

  const powerPercent = clampPercent((runtimeSeconds / getMaxGeneratorUptimeSeconds(base)) * 100);

  const daysRemaining = runtimeSeconds / (24 * 60 * 60);

  const fullDays = Math.floor(daysRemaining);

  const remainingHours = Math.floor((daysRemaining - fullDays) * 24);

  const generatorAvailable = base?.generatorDataAvailable !== false;

  const waterData = getWaterData(water);

  const waterCurrent = waterData.current;

  const waterMax = waterData.max;

  const waterPercent = waterData.percent;

  const waterAvailable = waterData.available && waterMax !== null && waterMax > 0;

  const storageData = getStorageData(inventory);

  const storageUsed = storageData.used;

  const storageMax = storageData.max;

  const storagePercent = storageData.percent;

  const storageAvailable = storageData.available && storageMax !== null && storageMax > 0;

  const isOwned = isOwnedBase(base);

  const dotColor = isOwned ? COLORS.gold : COLORS.water;

  return (
    <article
      style={{
        background: `
          linear-gradient(
            145deg,
            rgba(255,255,255,0.025),
            rgba(255,255,255,0.008)
          ),
          ${COLORS.panel}
        `,
        border: `1px solid ${isOwned ? "rgba(210, 168, 90, 0.22)" : "rgba(125, 184, 232, 0.18)"}`,
        borderRadius: 14,
        padding: 22,
        minWidth: 0,
        boxSizing: "border-box",
        boxShadow: "0 8px 28px rgba(0,0,0,0.2)",
        minHeight: 260,
      }}
    >
      {/* Base header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          paddingBottom: 16,
          marginBottom: 17,
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}
      >
        <div
          style={{
            minWidth: 0,
            flex: 1,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            {/* GLOWING BASE DOT */}
            <span
              className="portal-glow-dot"
              style={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: "50%",
                backgroundColor: dotColor,
                boxShadow: `
                  0 0 4px ${dotColor},
                  0 0 9px ${dotColor},
                  0 0 18px ${dotColor},
                  0 0 28px ${dotColor}
                `,
                "--dot-color": dotColor,
              }}
            />

            <strong
              style={{
                color: COLORS.text,
                fontSize: "1.05rem",
                fontWeight: 650,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={baseName}
            >
              {baseName}
            </strong>
          </div>

          <div
            style={{
              color: COLORS.dim,
              fontSize: "0.72rem",
              marginTop: 5,
              paddingLeft: 18,
              textAlign: "left",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={baseType}
          >
            {baseType}
          </div>

          {isOwned && (
            <a
              className="base-export-button"
              href={`/api/bases/${encodeURIComponent(baseId)}/export`}
              download
              style={{
                display: "block",
                width: "fit-content",
                marginTop: 10,
                marginLeft: 0,
                padding: "7px 11px",
                border: `1px solid ${COLORS.border}`,
                borderRadius: 7,
                backgroundColor: "rgba(210,168,90,0.08)",
                color: COLORS.goldLight,
                fontSize: "0.62rem",
                fontWeight: 700,
                textDecoration: "none",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              Download Blueprint ↓
            </a>
          )}
        </div>

        <span
          style={{
            flexShrink: 0,
            padding: "5px 9px",
            borderRadius: 999,
            backgroundColor: isOwned ? "rgba(210,168,90,0.08)" : "rgba(125,184,232,0.08)",
            border: `1px solid ${isOwned ? "rgba(210,168,90,0.2)" : "rgba(125,184,232,0.2)"}`,
            color: isOwned ? "#e3c27f" : "#8fc6ee",
            fontSize: "0.63rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {relationship}
        </span>
      </div>

      {/* Owner */}
      <div
        style={{
          marginBottom: 20,
          padding: "11px 13px",
          backgroundColor: "#ffffff04",
          border: `1px solid ${COLORS.borderLight}`,
          borderRadius: 8,
        }}
      >
        <div
          style={{
            color: COLORS.dim,
            fontSize: "0.62rem",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 3,
          }}
        >
          Owner
        </div>

        <div
          style={{
            color: COLORS.textSoft,
            fontSize: "0.8rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={owner}
        >
          {owner}
        </div>
      </div>

      {/* Telemetry */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: 18,
        }}
      >
        <TelemetryMetric label="Runtime" percent={generatorAvailable ? powerPercent : null} color={getPowerColor(powerPercent)} value={generatorAvailable ? `${fullDays}d ${remainingHours}h remaining` : "Unavailable"} />

        <TelemetryMetric
          label="Water"
          percent={waterPercent}
          color={getWaterColor(waterPercent)}
          value={waterAvailable ? `${formatVolume(waterCurrent)} / ${formatVolume(waterMax)}` : waterMax !== null ? `— / ${formatVolume(waterMax)}` : "No data"}
        />

        <TelemetryMetric label="Storage" percent={storagePercent} color={getStorageColor(storagePercent)} value={storageAvailable ? `${formatStorage(storageUsed)} / ${formatStorage(storageMax)}` : "No data"} />
      </div>

      {/* API warning */}
      {(telemetry?.waterError && !waterData.available) || (telemetry?.inventoryError && !storageData.available) ? (
        <div
          style={{
            marginTop: 15,
            paddingTop: 11,
            borderTop: `1px solid ${COLORS.borderLight}`,
            color: "#9b7462",
            fontSize: "0.65rem",
            lineHeight: 1.5,
          }}
        >
          Telemetry unavailable for one or more systems.
        </div>
      ) : null}

      {/* Base ID */}
      {baseId && (
        <div
          style={{
            marginTop: 14,
            color: "#5f4d3d",
            fontSize: "0.58rem",
            fontFamily: "monospace",
          }}
        />
      )}
    </article>
  );
}
