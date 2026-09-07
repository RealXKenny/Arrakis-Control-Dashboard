'use client';

import PortalTabs from './PortalTabs';
import layout from '../portal.module.css';
import CharacterHeader from './CharacterHeader';
import CharacterVitals from './CharacterVitals';
import InventoryAssets from './InventoryAssets';
import BaseSection from './BaseSection';
import VehicleSection from './VehicleSection';
import LoadingState from './LoadingState';
import PlayerDataError from './PlayerDataError';
import UnlinkedState from './UnlinkedState';
import MarketBoard from './MarketBoard';
import { styles } from '../config/colors';
import { usePlayerData } from '../hooks/usePlayerData';
import { extractBases, isOwnedBase } from '../utils/bases';
import { getNumber } from '../utils/formatting';
import { getLevelProgress } from '../utils/progression';
import { getCurrencyValue } from '../utils/telemetry';
import { extractVehicles } from '../utils/vehicles';

export default function PlayerPortal() {
  const {
    player,
    error,
    retry,
    loading,
    basesTelemetry,
    basesLoading,
    baseTab,
    setBaseTab,
    vehicleTab,
    setVehicleTab,
  } = usePlayerData();

  if (loading) {
    return <LoadingState />;
  }

  if (!player && error) {
    return <PlayerDataError message={error} onRetry={retry} />;
  }

  if (!player?.linked) {
    return <UnlinkedState />;
  }

  const details =
    player.details || {};

  const progression =
    details.progression || {};

  const intel =
    details.intel || {};

  const vitals =
    details.vitals || {};

  const solarisCoin =
    details['solaris-coin'] || {};

  const bases =
    extractBases(player);

  const vehicles =
    extractVehicles(player);

  const character = {
    name:
      player.characterName ||
      'Unknown Character',

    status:
      player.onlineStatus ||
      'Offline',

    guild:
      details.guild ?? null,

    level:
      getNumber(
        progression.level,
        progression.characterLevel,
        progression.character_level,
        details.level,
        player.level
      ) ?? 1,

    xp:
      getNumber(
        progression.xp,
        progression.experience,
        progression.experiencePoints,
        progression.experience_points,
        details.xp,
        player.xp
      ) ?? 0,

    intel:
      intel.intel ?? 0,

    maxIntel:
      intel.maxIntel ?? 0,

    solaris:
      solarisCoin.total ?? 0,

    health:
      Math.round(
        vitals.currentHealth ?? 100
      ),

    maxHealth:
      Math.round(
        vitals.maxHealth ?? 100
      ),

    hydration:
      Math.round(
        vitals.hydration ?? 100
      ),

    solarisCredit: getCurrencyValue(
      player.currency,
      details.currency,
      player.solarisCredit,
      player.solaris_credit,
      player.credit,
      player.credits
    ),

    scrip:
      details.scrip ??
      player.scrip ??
      0,
  };

  const levelProgress =
    getLevelProgress(
      character.level,
      character.xp
    );

  const percent = (
    current,
    max
  ) => {
    const currentNumber =
      Number(current);

    const maxNumber =
      Number(max);

    if (
      !Number.isFinite(
        currentNumber
      ) ||
      !Number.isFinite(maxNumber) ||
      maxNumber <= 0
    ) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(
        100,
        (currentNumber /
          maxNumber) *
          100
      )
    );
  };

  const isOnline =
    String(character.status)
      .toLowerCase()
      .includes('online');

  const ownedBases =
    bases.filter(
      (base) =>
        isOwnedBase(base)
    );

  const sharedBases =
    bases.filter(
      (base) =>
        !isOwnedBase(base)
    );

  const visibleBases =
    baseTab === 'owned'
      ? ownedBases
      : sharedBases;

  return (
    <main className={`portal-page ${layout.page}`} style={styles.page}>
      <PortalTabs />

      <div style={styles.container}>
        <CharacterHeader
          character={character}
          isOnline={isOnline}
        />

        <CharacterVitals
          character={character}
          levelProgress={levelProgress}
          percent={percent}
        />

        <InventoryAssets character={character} />

        <MarketBoard />

        <BaseSection
          playerId={player.pawnId ?? player.controllerId}
          visibleBases={visibleBases}
          basesTelemetry={basesTelemetry}
          basesLoading={basesLoading}
          bases={bases}
          ownedBases={ownedBases}
          sharedBases={sharedBases}
          baseTab={baseTab}
          setBaseTab={setBaseTab}
        />

        <VehicleSection
          vehicles={vehicles}
          playerName={character.name}
          vehicleTab={vehicleTab}
          setVehicleTab={setVehicleTab}
        />
      </div>

      <style jsx>{`
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
            filter: brightness(1);
          }

          50% {
            transform: scale(1.4);
            opacity: 1;
            filter: brightness(1.7);
          }
        }

        @keyframes portalSpin {
          to {
            transform: rotate(360deg);
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

        @media (max-width: 900px) {
          .vitals-grid {
            grid-template-columns: 1fr 1fr !important;
          }

          .vitals-grid > div:last-child {
            grid-column: 1 / -1;
          }

          .base-grid {
            grid-template-columns: 1fr !important;
          }

          .base-grid-last {
            grid-column: auto !important;
          }
        }

        .vehicle-grid {
          grid-template-columns: repeat(
            2,
            minmax(0, 1fr)
          );
        }

        @media (max-width: 900px) {
          .vehicle-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 620px) {
          .vitals-grid {
            grid-template-columns: 1fr !important;
          }

          .vitals-grid > div:last-child {
            grid-column: auto;
          }

          .currency-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (min-width: 901px) {
          .base-grid-last {
            grid-column: 1 / -1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-glow-dot,
          .portal-status-dot {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
