import { clearClientReadCache } from '../../../lib/client-cache';
import { usePortalView, navigatePortal, usePortalDestination } from '../hooks/usePortalView';
import Image from 'next/image';
import { useState } from 'react';
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
import { portalNavigation } from '../config/navigation';
import CharacterDossier from './CharacterDossier';
import StorageWorkspace from './StorageWorkspace';
import dossier from '../dossier.module.css';
import { label, record } from '../utils/inventory';
import { portalPageCopy } from '../config/page-copy';
import MapWindow from '../../map/components/MapWindow';
import { useGuildData } from '../hooks/useGuildData';
import { guildRoleLabel } from '../utils/guild';
import { useSiteConfig } from '../../../components/SiteConfigProvider';
import { useMapDestinations } from '../../map/hooks/useMapDestinations';

export default function PlayerPortal() {
  const site = useSiteConfig();
  const { destinations } = useMapDestinations();
  const [selectedMapDestination] = usePortalDestination();
  const view = usePortalView();
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
  const guildData = useGuildData(character, view === 'guild');
  const bases = extractBases(player);
  const vehicles = extractVehicles(player);
  const ownedBases = bases.filter(isOwnedBase);
  const sharedBases = bases.filter((base) => !isOwnedBase(base));
  const [logoMessage, setLogoMessage] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const guildId = guildData.currentGuild?.guild_id ?? record(character?.guild).id;
  const guildName = label(guildData.currentGuild?.guild_name ?? record(character?.guild).name, 'No guild reported');
  const factionName = label(
    guildData.currentGuild?.guild_faction_name ?? guildData.currentGuild?.guild_faction,
    'Not reported',
  );
  const factionIcon = /atreides/i.test(factionName)
    ? '/maps/atreides.webp'
    : /harkonnen/i.test(factionName)
      ? '/maps/harkonnen.webp'
      : null;
  const guildDescription =
    typeof guildData.currentGuild?.guild_description === 'string' ? guildData.currentGuild.guild_description : '';
  const rankGroups = [
    { label: 'Leader', roleId: '100' },
    { label: 'Officer', roleId: '50' },
    { label: 'Member', roleId: '1' },
  ].map((group) => ({
    ...group,
    members: guildData.members
      .filter((member) => String(member.role_id) === group.roleId)
      .sort((a, b) =>
        String(a.character_name ?? '').localeCompare(String(b.character_name ?? ''), undefined, {
          sensitivity: 'base',
        }),
      ),
  }));
  const guildOwner = guildData.members.find((member) => String(member.role_id) === '100');
  const canEditLogo = guildData.currentMember?.role_id != null && String(guildData.currentMember.role_id) === '100';

  async function uploadGuildLogo(file: File) {
    if (!guildId || file.type !== 'image/png' || file.size > site.guildLogoMaxBytes) {
      setLogoMessage(`Choose a PNG logo no larger than ${Math.floor(site.guildLogoMaxBytes / 1024)} KiB.`);
      return;
    }
    setLogoUploading(true);
    setLogoMessage('');
    try {
      const logo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('read')));
        reader.onerror = () => reject(new Error('read'));
        reader.readAsDataURL(file);
      });
      const response = await fetch(`/api/guilds/${encodeURIComponent(String(guildId))}/logo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Unable to save logo');
      guildData.setLogo(body.data.logo);
      setLogoMessage('Guild logo saved.');
    } catch (error) {
      setLogoMessage(error instanceof Error ? error.message : 'Unable to save guild logo.');
    } finally {
      setLogoUploading(false);
    }
  }

  return (
    <DashboardShell
      brand={site.name}
      brandHref="/portal?view=overview"
      subtitle={site.subtitle}
      navigation={portalNavigation(view, site, destinations, selectedMapDestination)}
      onNavigate={navigatePortal}
      actions={
        sessionExpired ? (
          <a href="/auth/login">Connect Discord</a>
        ) : (
          <>
            <span className={layout.account}>{character?.name ?? 'Survivor'}</span>
            <button onClick={retry} disabled={statusLoading} aria-label="Refresh telemetry">
              ↻
            </button>
            <form method="post" action="/api/auth/logout" onSubmit={() => clearClientReadCache()}>
              <button type="submit">Sign out</button>
            </form>
          </>
        )
      }
    >
      <div className={layout.page}>
        {view !== 'overview' && (
          <header className={layout.hero}>
            <p className={layout.eyebrow}>
              {site.name} | {copy.section}
            </p>
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
            {view === 'market' && site.features.market && <MarketBoard />}
            {(view === 'hagga' || view === 'deep-desert') && site.features.maps && (
              <MapWindow
                key={`${view}:${selectedMapDestination}`}
                mapName={view === 'hagga' ? 'HaggaBasin' : 'DeepDesert'}
                initialDestinationKey={selectedMapDestination}
              />
            )}
            {view === 'character' && <CharacterDossier character={character} details={player.details ?? {}} />}
            {view === 'storage' && <StorageWorkspace character={character} inventory={player.details?.inventory} />}
            {view === 'guild' && site.features.guilds && (
              <section className={`${dossier.panel} ${dossier.guildPanel}`}>
                <h2>Guild membership</h2>
                <div className={dossier.identity}>
                  {canEditLogo ? (
                    <label className={`${dossier.avatar} ${dossier.avatarEditable}`} title="Upload guild logo">
                      {guildData.logo ? (
                        <Image src={guildData.logo} alt={`${guildName} logo`} width={64} height={64} unoptimized />
                      ) : (
                        <span aria-hidden="true">◈</span>
                      )}
                      <span className={dossier.uploadOverlay} aria-hidden="true">
                        ⇧
                      </span>
                      <input
                        className={dossier.logoInput}
                        type="file"
                        accept="image/png"
                        disabled={logoUploading}
                        aria-label="Upload guild logo PNG"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void uploadGuildLogo(file);
                          event.target.value = '';
                        }}
                      />
                    </label>
                  ) : (
                    <span className={dossier.avatar} aria-hidden="true">
                      {guildData.logo ? <Image src={guildData.logo} alt="" width={64} height={64} unoptimized /> : '◈'}
                    </span>
                  )}
                  <div>
                    <h3>{guildName}</h3>
                    <div className={dossier.guildMeta}>
                      {guildOwner && <p>Guild owner: {label(guildOwner.character_name, 'Not reported')}</p>}
                      <p>
                        {character.guild
                          ? `Your rank: ${
                              guildData.currentMember
                                ? guildRoleLabel(guildData.currentMember.role_id)
                                : label(record(character.guild).rank, 'Not reported')
                            }`
                          : 'No membership was returned by the server. Refresh telemetry after joining a guild in game.'}
                      </p>
                    </div>
                    {guildDescription && <p className={dossier.guildDescription}>{guildDescription}</p>}
                  </div>
                </div>
                {guildData.currentGuild && (
                  <dl className={dossier.guildFacts}>
                    <div>
                      <dt>Faction</dt>
                      <dd className={dossier.factionValue}>
                        {factionIcon && <Image src={factionIcon} alt="" aria-hidden="true" width={24} height={24} />}
                        <span>{factionName}</span>
                      </dd>
                    </div>
                    <div>
                      <dt>Members</dt>
                      <dd>
                        {label(guildData.currentGuild.member_count, String(guildData.members.length || 'Not reported'))}
                      </dd>
                    </div>
                  </dl>
                )}
                {logoMessage && <p role="status">{logoMessage}</p>}
                {guildData.loading && <p role="status">Loading guild members…</p>}
                {guildData.error && <p role="alert">{guildData.error}</p>}
                <div className={dossier.rankGrid}>
                  {rankGroups.map((group) => (
                    <section
                      className={dossier.rankCard}
                      key={group.roleId}
                      aria-labelledby={`guild-rank-${group.roleId}`}
                    >
                      <div className={dossier.rankHeader}>
                        <h3 id={`guild-rank-${group.roleId}`}>{group.label}</h3>
                        <span>{group.members.length}</span>
                      </div>
                      {group.members.length > 0 ? (
                        <ul className={dossier.rankMembers} aria-label={`${group.label} members`}>
                          {group.members.map((member, index) => (
                            <li key={String(member.player_id ?? index)}>
                              <strong>{label(member.character_name, 'Unknown member')}</strong>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className={dossier.emptyRank}>No members reported</p>
                      )}
                    </section>
                  ))}
                </div>
                <p className={dossier.guildFooter}>Manage your guild and membership in game.</p>
              </section>
            )}
            {view === 'bases' && site.features.bases && (
              <BaseSection
                visibleBases={baseTab === 'owned' ? ownedBases : sharedBases}
                basesTelemetry={basesTelemetry}
                basesLoading={basesLoading}
                bases={bases}
                ownedBases={ownedBases}
                sharedBases={sharedBases}
                baseTab={baseTab}
                setBaseTab={setBaseTab}
                showImport={site.features.baseImports}
              />
            )}
            {view === 'vehicles' && site.features.vehicles && (
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
