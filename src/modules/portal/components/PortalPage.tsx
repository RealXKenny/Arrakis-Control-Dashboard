import { useRouter } from 'next/router';
import DashboardShell from '../../../components/DashboardShell';
import layout from '../portal.module.css';
import PortalSummary from './PortalSummary';
import BaseSection from './BaseSection';
import VehicleSection from './VehicleSection';
import MarketBoard from './MarketBoard';
import { usePlayerData } from '../hooks/usePlayerData';
import { extractBases, isOwnedBase } from '../utils/bases';
import { extractVehicles } from '../utils/vehicles';
import { buildCharacter } from '../utils/character';
import { getPortalView, portalNavigation } from '../config/navigation';
import CharacterDossier from './CharacterDossier';
import StorageWorkspace from './StorageWorkspace';
import dossier from '../dossier.module.css';
import { label, record } from '../utils/inventory';
import { portalPageCopy } from '../config/page-copy';

export default function PlayerPortal() {
  const { query } = useRouter();
  const view = getPortalView(query.view);
  const copy = portalPageCopy[view];
  const {
    player,
    error,
    retry,
    loading,
    statusLoading,
    updatedAt,

    sessionExpired,
    basesTelemetry,
    basesLoading,
    baseTab,
    setBaseTab,
    vehicleTab,
    setVehicleTab,
  } = usePlayerData();
  const character = player?.linked ? buildCharacter(player) : null;
  const bases = extractBases(player);
  const vehicles = extractVehicles(player);
  const ownedBases = bases.filter(isOwnedBase);
  const sharedBases = bases.filter((base) => !isOwnedBase(base));

  return (
    <DashboardShell
      brand="Crimson Skies"
      brandHref="/portal"
      subtitle="Arrakis field companion"
      navigation={portalNavigation(view)}
      actions={
        sessionExpired ? (
          <a href="/auth/login">Connect Discord</a>
        ) : (
          <>
            <span className={layout.account}>{character?.name ?? 'Survivor'}</span>
            <button onClick={retry} disabled={statusLoading} aria-label="Refresh telemetry">
              ↻
            </button>
            <form method="post" action="/api/auth/logout">
              <button type="submit">Sign out</button>
            </form>
          </>
        )
      }
    >
      <div className={layout.page}>
        {view !== 'overview' && (
          <header className={layout.hero}>
            <p className={layout.eyebrow}>Crimson Skies | {copy.section}</p>
            <h1>{copy.title}</h1>
            <p>{copy.description}</p>
          </header>
        )}
        {error && (
          <div role="alert" className={layout.notice}>
            {error}{' '}
            {sessionExpired ? (
              <a href="/auth/login">Sign in again →</a>
            ) : (
              <button onClick={retry} disabled={statusLoading}>
                Try again
              </button>
            )}
          </div>
        )}
        {loading && (
          <div role="status" className={layout.skeleton}>
            Reading your character and holdings…
          </div>
        )}
        {!loading && !error && !character && (
          <section className={layout.notice}>
            <h2>Link your character</h2>
            <p>Connect your Dune character using your server’s Discord integration, then refresh this page.</p>
            <button onClick={retry}>Check connection</button>
          </section>
        )}
        {character && (
          <>
            {view === 'overview' && (
              <PortalSummary
                character={character}
                baseCount={player.details?.bases == null ? null : bases.length}
                vehicleCount={player.details?.vehicles == null ? null : vehicles.length}
                updatedAt={updatedAt}
              />
            )}
            {view === 'market' && <MarketBoard />}
            {view === 'character' && <CharacterDossier character={character} details={player.details ?? {}} />}
            {view === 'storage' && <StorageWorkspace character={character} inventory={player.details?.inventory} />}
            {view === 'guild' && (
              <section className={dossier.panel}>
                <h2>Guild membership</h2>
                <div className={dossier.identity}>
                  <span className={dossier.avatar} aria-hidden="true">
                    ◈
                  </span>
                  <div>
                    <h3>{label(record(character.guild).name, 'No guild reported')}</h3>
                    <p>
                      {character.guild
                        ? `Your rank: ${label(record(character.guild).rank, 'Not reported')}`
                        : 'No membership was returned by the server. Refresh telemetry after joining a guild in game.'}
                    </p>
                  </div>
                </div>
                <p>Manage your guild and membership in game.</p>
              </section>
            )}
            {view === 'bases' && (
              <BaseSection
                visibleBases={baseTab === 'owned' ? ownedBases : sharedBases}
                basesTelemetry={basesTelemetry}
                basesLoading={basesLoading}
                bases={bases}
                ownedBases={ownedBases}
                sharedBases={sharedBases}
                baseTab={baseTab}
                setBaseTab={setBaseTab}
              />
            )}
            {view === 'vehicles' && (
              <VehicleSection
                vehicles={vehicles}
                playerName={character.name}
                vehicleTab={vehicleTab}
                setVehicleTab={setVehicleTab}
              />
            )}
          </>
        )}
      </div>
    </DashboardShell>
  );
}
