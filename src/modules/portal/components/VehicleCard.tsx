import { COLORS } from "../config/colors";
import { clampPercent, getNumber } from "../utils/formatting";
import { getVehicleName, getVehicleType, getVehicleOwner, isOwnedVehicle } from "../utils/vehicles";
import TelemetryMetric from "./TelemetryMetric";

export default function VehicleCard({ vehicle, index, playerName }) {
  const vehicleName = getVehicleName(vehicle, index);

  const vehicleType = getVehicleType(vehicle);

  const owner = getVehicleOwner(vehicle);

  const owned = isOwnedVehicle(vehicle, playerName);

  const relationship = owned ? "Owned" : "Shared";

  const condition = getNumber(vehicle?.condition_percent, vehicle?.conditionPercent, vehicle?.condition);

  const fuel = getNumber(vehicle?.fuel_percent, vehicle?.fuelPercent);

  const currentFuel = vehicle?.current_fuel ?? vehicle?.currentFuel;

  const accent = owned ? COLORS.gold : COLORS.water;

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
        border: `1px solid ${owned ? "rgba(210,168,90,0.22)" : "rgba(125,184,232,0.18)"}`,
        borderRadius: 14,
        padding: 22,
        minWidth: 0,
        boxSizing: "border-box",
        boxShadow: "0 8px 28px rgba(0,0,0,0.2)",
        minHeight: 260,
      }}
    >
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
            }}
          >
            <span
              className="portal-glow-dot"
              style={{
                width: 8,
                height: 8,
                flexShrink: 0,
                borderRadius: "50%",
                backgroundColor: accent,
                boxShadow: `
                  0 0 4px ${accent},
                  0 0 9px ${accent},
                  0 0 18px ${accent},
                  0 0 28px ${accent}
                `,
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
              title={vehicleName}
            >
              {vehicleName}
            </strong>
          </div>

          <div
            style={{
              color: COLORS.dim,
              fontSize: "0.72rem",
              marginTop: 5,
              paddingLeft: 18,
            }}
          >
            {vehicleType}
          </div>
        </div>

        <span
          style={{
            flexShrink: 0,
            padding: "5px 9px",
            borderRadius: 999,
            backgroundColor: owned ? "rgba(210,168,90,0.08)" : "rgba(125,184,232,0.08)",
            border: `1px solid ${owned ? "rgba(210,168,90,0.2)" : "rgba(125,184,232,0.2)"}`,
            color: owned ? "#e3c27f" : "#8fc6ee",
            fontSize: "0.63rem",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {relationship}
        </span>
      </div>

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
          }}
        >
          {owner}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 18,
        }}
      >
        <TelemetryMetric label="Condition" percent={condition === null ? null : clampPercent(condition)} color={condition !== null && condition <= 25 ? COLORS.red : COLORS.gold} value={condition === null ? "No data" : `${condition.toFixed(0)}%`} />

        <TelemetryMetric
          label="Fuel"
          percent={fuel === null ? null : clampPercent(fuel)}
          color={fuel !== null && fuel <= 25 ? COLORS.red : COLORS.gold}
          value={currentFuel !== undefined && currentFuel !== null ? Number(currentFuel).toFixed(2).replace(/\.00$/, "") : fuel === null ? "No data" : `${fuel.toFixed(0)}%`}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 13,
          marginTop: 18,
        }}
      >
        {[].map(([label, value]) => (
          <div
            key={label}
            style={{
              padding: 12,
              backgroundColor: "#ffffff04",
              border: `1px solid ${COLORS.borderLight}`,
              borderRadius: 8,
              minWidth: 0,
            }}
          >
            <div
              style={{
                color: COLORS.dim,
                fontSize: "0.6rem",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginBottom: 4,
              }}
            >
              {label}
            </div>

            <div
              style={{
                color: COLORS.textSoft,
                fontSize: "0.72rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={String(value)}
            >
              {String(value)}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
