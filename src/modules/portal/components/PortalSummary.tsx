import Link from './PortalLink';
import Image from 'next/image';
import { useState } from 'react';
import { useServerStatus } from '../../home/hooks/useServerStatus';
import { formatNumber } from '../utils/formatting';
import { label, record } from '../utils/inventory';
import { guildRoleLabel } from '../utils/guild';
import type { buildCharacter } from '../utils/character';
import { timeRemaining } from '../utils/world';
import { useWorldReading } from '../hooks/useWorldReading';
import css from '../overview.module.css';
import PopulationChart from './PopulationChart';

export default function PortalSummary({
  character,
  baseCount,
  vehicleCount,
  updatedAt,
}: {
  character: ReturnType<typeof buildCharacter>;
  baseCount: number | null;
  vehicleCount: number | null;
  updatedAt: number | null;
}) {
  const [map, setMap] = useState('HaggaBasin');
  const { reading, error, expired, now } = useWorldReading(map);
  const { activePlayers } = useServerStatus();
  const mapName = map === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin';
  const guild = record(character.guild);
  const guildName = label(guild.name, 'No guild reported');
  const guildFaction = label(guild.faction, 'Not reported');
  const guildRank = guildRoleLabel(guild.rank);
  const age = reading ? Math.max(0, Math.floor((now - Date.parse(reading.observedAt)) / 1000)) : null;
  const stale = error || (age !== null && age > 90);
  const headline = reading?.spice
    ? reading.spice.count > 0
      ? reading.spice.sectors.length
        ? `Spice blowing at ${reading.spice.sectors[0]}.`
        : `${reading.spice.count} spice fields active.`
      : 'No active spice fields reported. Explore the desert.'
    : 'Your next chapter on Arrakis.';
  return (
    <div className={css.overview}>
      <section className={css.briefing} aria-label="World briefing">
        <div className={css.horizon} aria-hidden="true" />
        <div className={css.serverLine}>
          <strong className={css.serverName}>Crimson Skies / Command</strong>
          <span className={css.micro}>
            Coriolis cycle in <b>{timeRemaining(reading?.nextCycleAt ?? null, now)}</b>
          </span>
          <div className={css.mapSwitch} role="group" aria-label="Briefing map">
            <button aria-pressed={map === 'HaggaBasin'} onClick={() => setMap('HaggaBasin')}>
              Hagga Basin
            </button>
            <button aria-pressed={map === 'DeepDesert'} onClick={() => setMap('DeepDesert')}>
              Deep Desert
            </button>
          </div>
        </div>
        <div className={css.briefingBody}>
          <div className={css.dispatch}>
            <p className={css.kicker}>Your world. Your next move.</p>
            <h1>Make Arrakis yours.</h1>
            <div className={css.dispatchMeta}>
              <div className={css.readingLine}>
                <strong>Reading {mapName}.</strong>
                <span className={css.micro}>
                  {character.name} is {character.status}
                </span>
              </div>
              <p className={css.micro}>
                {formatNumber(activePlayers, 0)} online <span className={css.accent}>Across the server</span>
              </p>
            </div>
            <div className={css.conditionPanel}>
              <span className={css.conditionLabel}>Current field conditions</span>
              <h2 className={css.conditions}>{headline}</h2>
              <p className={css.conditionDetail}>
                {reading?.spice
                  ? reading.spice.sectors.length
                    ? `Spice reported in ${reading.spice.sectors.slice(0, 8).join(', ')}${reading.spice.sectors.length > 8 ? ' and more' : ''}.`
                    : 'Sector coordinates were not reported.'
                  : 'Live spice conditions are not available yet.'}
              </p>
            </div>
            <p className={css.freshness} role="status">
              {expired ? (
                <>
                  Your session has ended. <a href="/auth/login">Sign in again</a>
                </>
              ) : stale ? (
                'World reading delayed — showing the last available data.'
              ) : reading ? (
                `Updated ${age}s ago · read-only conditions`
              ) : (
                'Reading world conditions…'
              )}
            </p>
          </div>
          <aside className={css.identity} aria-label="Your character at a glance">
            <span className={css.kicker}>Your presence on Arrakis</span>
            <div className={css.monogram}>
              {character.avatarUrl ? (
                <Image
                  src={character.avatarUrl}
                  alt={`${character.name}'s Discord avatar`}
                  width={56}
                  height={56}
                  unoptimized
                />
              ) : (
                <span aria-hidden="true">{character.name.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <h2>{character.name}</h2>
            <p>{guildName}</p>
            <div className={css.identityStats}>
              <span>
                <strong>{formatNumber(character.level, 0)}</strong>Level
              </span>
              <span>
                <strong>{character.status}</strong>Character status
              </span>
              <span>
                <strong>{label(record(character.guild).faction, 'Not reported')}</strong>Faction
              </span>
              <span>
                <strong>{guildRoleLabel(record(character.guild).rank)}</strong>Guild rank
              </span>
            </div>
            <Link href="/portal?view=character">
              Open your dossier <span aria-hidden="true">↗</span>
            </Link>
          </aside>
        </div>
      </section>
      <div className={css.cards}>
        <Link className={css.card} href="/portal?view=storage">
          <span className={css.kicker}>Solari credit</span>
          <strong>{formatNumber(character.solarisCredit, 0)}</strong>
          <span>Personal reserves</span>
          <b aria-hidden="true">↗</b>
        </Link>
        <Link className={css.card} href="/portal?view=market">
          <span className={css.kicker}>Exchange</span>
          <strong>
            {formatNumber(reading?.market?.listings, 0)} <small>listings</small>
          </strong>
          <span>{formatNumber(reading?.market?.items, 0)} item types · Server exchange</span>
          <b aria-hidden="true">↗</b>
        </Link>
        <Link className={css.card} href={`/portal?view=${map === 'DeepDesert' ? 'deep-desert' : 'hagga'}`}>
          <span className={css.kicker}>Spice | {mapName}</span>
          <strong>
            {formatNumber(reading?.spice?.count, 0)} <small>active</small>
          </strong>
          <span>Explore the live map</span>
          <b aria-hidden="true">↗</b>
        </Link>
        <a className={css.card} href="#landsraad">
          <span className={css.kicker}>Landsraad term</span>
          <strong>
            {formatNumber(reading?.council?.decided, 0)} <small>of {formatNumber(reading?.council?.total, 0)}</small>
          </strong>
          <span>Houses decided</span>
          <b aria-hidden="true">↓</b>
        </a>
      </div>
      <div className={css.panels}>
        <section className={css.panel} aria-labelledby="guild-summary">
          <h2 id="guild-summary">Guild</h2>
          <div className={`${css.inset} ${css.guildSummary}`}>
            <h3>{guildName}</h3>
            <p className={css.guildDescription}>
              {character.guild
                ? 'Your place in the sietch.'
                : 'Your character has no reported guild membership. Join a guild in game to see it here.'}
            </p>
            {character.guild && (
              <div className={css.guildFacts}>
                <div>
                  <span>Faction</span>
                  <strong>{guildFaction}</strong>
                </div>
                <div>
                  <span>Your rank</span>
                  <strong>{guildRank}</strong>
                </div>
              </div>
            )}
          </div>
          <Link className={css.panelAction} href="/portal?view=guild">
            View guild <span aria-hidden="true">↗</span>
          </Link>
        </section>
        <section className={css.panel} aria-labelledby="holdings-summary">
          <h2 id="holdings-summary">Your holdings</h2>
          <div className={css.holdings}>
            <Link href="/portal?view=bases">
              <strong>{formatNumber(baseCount, 0)}</strong>
              <span>Bases ↗</span>
            </Link>
            <Link href="/portal?view=vehicles">
              <strong>{formatNumber(vehicleCount, 0)}</strong>
              <span>Vehicles ↗</span>
            </Link>
          </div>
          <p>Owned and shared assets in your network.</p>
          <Link href="/portal?view=character">Open character ↗</Link>
        </section>
      </div>
      <section className={css.wideSection} aria-labelledby="pulse-summary">
        <h2 className={css.sectionTitle} id="pulse-summary">
          Server rhythm <span>Last 24 hours</span>
        </h2>
        <PopulationChart history={reading?.population} totalPlayHours={reading?.totalPlayHours} />
      </section>
      <section className={`${css.wideSection} ${css.councilSection}`} id="landsraad" aria-labelledby="council-summary">
        <h2 className={css.sectionTitle} id="council-summary">
          Balance of power <span>Landsraad</span>
        </h2>
        <div className={`${css.panel} ${css.widePanel}`}>
          <h2>Landsraad {reading?.council ? `· Term ${reading.council.term}` : ''}</h2>
          {reading?.council ? (
            <>
              <div className={css.factions}>
                <div className={reading.council.atreides > reading.council.harkonnen ? css.leading : undefined}>
                  <Image
                    className={css.crest}
                    src="/maps/atreides.webp"
                    alt="House Atreides crest"
                    width={72}
                    height={72}
                    unoptimized
                  />
                  <strong>{formatNumber(reading.council.atreides, 0)}</strong>
                  <span>Atreides</span>
                </div>
                <span className={css.versus}>vs</span>
                <div className={reading.council.harkonnen > reading.council.atreides ? css.leading : undefined}>
                  <Image
                    className={css.crest}
                    src="/maps/harkonnen.webp"
                    alt="House Harkonnen crest"
                    width={72}
                    height={72}
                    unoptimized
                  />
                  <strong>{formatNumber(reading.council.harkonnen, 0)}</strong>
                  <span>Harkonnen</span>
                </div>
              </div>
              <p>
                <span>
                  {reading.council.decided}/{reading.council.total} houses decided
                </span>{' '}
                | Term ends <b className={css.streaming}>{timeRemaining(reading.council.endsAt, now)}</b>
              </p>
            </>
          ) : (
            <p>The current Landsraad term is not available.</p>
          )}
        </div>
      </section>
      <p className={css.footnote}>
        Read from the Crimson Skies server.{' '}
        {updatedAt ? `Character updated ${new Date(updatedAt).toLocaleTimeString()}.` : ''}{' '}
        <Link href="/portal?view=storage">Open storage ↗</Link>
      </p>
    </div>
  );
}
