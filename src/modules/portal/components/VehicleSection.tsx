import { COLORS, styles } from '../config/colors';
import { getVehicleId, isOwnedVehicle, isVehicleAccessible } from '../utils/vehicles';
import VehicleCard from './VehicleCard';

function VehicleGrid({
  vehicles,
  playerName,
  vehicleTab,
  setVehicleTab,
}) {
  const accessibleVehicles =
    vehicles.filter((vehicle) =>
      isVehicleAccessible(
        vehicle,
        playerName
      )
    );

  const ownedVehicles =
    accessibleVehicles.filter((vehicle) =>
      isOwnedVehicle(
        vehicle,
        playerName
      )
    );

  const sharedVehicles =
    accessibleVehicles.filter(
      (vehicle) =>
        !isOwnedVehicle(
          vehicle,
          playerName
        )
    );

  const visibleVehicles =
    vehicleTab === 'owned'
      ? ownedVehicles
      : sharedVehicles;

  if (visibleVehicles.length === 0) {
    return (
      <div
        style={{
          padding: 32,
          textAlign: 'center',
          backgroundColor: '#ffffff03',
          border:
            `1px solid ${COLORS.borderLight}`,
          borderRadius: 10,
        }}
      >
        <div
          style={{
            color: COLORS.textSoft,
            fontSize: '0.9rem',
            marginBottom: 5,
          }}
        >
          No vehicles found
        </div>

        <div
          style={{
            color: COLORS.dim,
            fontSize: '0.75rem',
          }}
        >
          There are currently no vehicles
          in this category.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Own / Shared tabs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(2, minmax(0, 1fr))',
          gap: 8,
          padding: 5,
          marginBottom: 20,
          backgroundColor: '#0c0805',
          border:
            `1px solid ${COLORS.border}`,
          borderRadius: 10,
        }}
      >
        <button
          type="button"
          onClick={() =>
            setVehicleTab('owned')
          }
          style={{
            appearance: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 7,
            padding: '11px 14px',
            backgroundColor:
              vehicleTab === 'owned'
                ? 'rgba(210,168,90,0.12)'
                : 'transparent',
            color:
              vehicleTab === 'owned'
                ? COLORS.text
                : COLORS.dim,
            boxShadow:
              vehicleTab === 'owned'
                ? 'inset 0 0 0 1px rgba(210,168,90,0.16)'
                : 'none',
            fontSize: '0.76rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          Own Vehicles

          <span
            style={{
              marginLeft: 7,
              color:
                vehicleTab === 'owned'
                  ? COLORS.gold
                  : COLORS.dim,
            }}
          >
            {ownedVehicles.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() =>
            setVehicleTab('shared')
          }
          style={{
            appearance: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 7,
            padding: '11px 14px',
            backgroundColor:
              vehicleTab === 'shared'
                ? 'rgba(125,184,232,0.1)'
                : 'transparent',
            color:
              vehicleTab === 'shared'
                ? '#b5d9f2'
                : COLORS.dim,
            boxShadow:
              vehicleTab === 'shared'
                ? 'inset 0 0 0 1px rgba(125,184,232,0.15)'
                : 'none',
            fontSize: '0.76rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.6px',
          }}
        >
          Shared Vehicles

          <span
            style={{
              marginLeft: 7,
              color:
                vehicleTab === 'shared'
                  ? COLORS.water
                  : COLORS.dim,
            }}
          >
            {sharedVehicles.length}
          </span>
        </button>
      </div>

      {/* Vehicle cards */}
      <div
        className="vehicle-grid"
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(2, minmax(0, 1fr))',
          gap: 18,
        }}
      >
        {visibleVehicles.map(
          (vehicle, index) => {
            const isOddFinalVehicle =
              visibleVehicles.length % 2 === 1 &&
              index ===
              visibleVehicles.length - 1;

            const vehicleId =
              getVehicleId(vehicle);

            return (
              <div
                key={
                  vehicleId ??
                  `vehicle-${index}`
                }
                style={{
                  minWidth: 0,
                  gridColumn:
                    isOddFinalVehicle
                      ? '1 / -1'
                      : 'auto',
                }}
              >
                <VehicleCard
                  vehicle={vehicle}
                  index={index}
                  playerName={playerName}
                />
              </div>
            );
          }
        )}
      </div>
    </>
  );
}
export default function VehicleSection({
  vehicles,
  playerName,
  vehicleTab,
  setVehicleTab,
}) {
  return (
    <section
      style={{
        ...styles.panel,
        padding: 24,
        marginBottom: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 15,
          flexWrap: 'wrap',
          marginBottom: 18,
        }}
      >
        <div>
          <p
            style={{
              margin: '0 0 5px',
              color: COLORS.goldLight,
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
            }}
          >
            Vehicle Network
          </p>

          <h2 style={styles.sectionTitle}>
            Vehicles
          </h2>
        </div>

        <div
          style={{
            color: COLORS.dim,
            fontSize: '0.72rem',
          }}
        >
          {vehicles.length}{' '}
          owned / shared
        </div>
      </div>

      <VehicleGrid
        vehicles={vehicles}
        playerName={playerName}
        vehicleTab={vehicleTab}
        setVehicleTab={setVehicleTab}
      />
    </section>
  );
}