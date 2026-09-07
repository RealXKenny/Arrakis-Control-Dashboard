import Link from 'next/link';
import { useState } from 'react';
import { useServerStatus } from '../../home/hooks/useServerStatus';
import { formatNumber } from '../utils/formatting';
import { label, record } from '../utils/inventory';
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
  const [map, setMap] = useState('DeepDesert');
  const { reading, error, expired, now } = useWorldReading(map);
  const { activePlayers } = useServerStatus();
  const mapName = map === 'DeepDesert' ? 'Deep Desert' : 'Hagga Basin';
  const guildName = label(record(character.guild).name, 'No guild reported');
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
        <div className={css.serverLine}>
          <strong className={css.serverName}>Crimson Skies</strong>
          <span className={css.micro}>
            Coriolis cycle in <b>{timeRemaining(reading?.nextCycleAt ?? null, now)}</b>
          </span>
          <div className={css.mapSwitch} role="group" aria-label="Briefing map">
            <button aria-pressed={map === 'DeepDesert'} onClick={() => setMap('DeepDesert')}>
              Deep Desert
            </button>
            <button aria-pressed={map === 'HaggaBasin'} onClick={() => setMap('HaggaBasin')}>
              Hagga Basin
            </button>
          </div>
        </div>
        <div className={css.readingLine}>
          <strong>Reading {mapName}.</strong>
          <span className={css.micro}>
            {character.name} is {character.status}
          </span>
        </div>
        <p className={css.micro}>
          {formatNumber(activePlayers, 0)} online <span className={css.accent}>Field intelligence</span>
        </p>
        <p className={css.kicker}>{mapName} | The sietch reads</p>
        <h1>{headline}</h1>
        <ul className={css.notes}>
          <li>
            {character.name} · Level {formatNumber(character.level, 0)} · {guildName}
          </li>
          <li>
            {reading?.spice
              ? reading.spice.sectors.length
                ? `Spice reported in ${reading.spice.sectors.slice(0, 8).join(', ')}${reading.spice.sectors.length > 8 ? ' and more' : ''}.`
                : 'Sector coordinates were not reported.'
              : 'Live spice conditions are not available yet.'}
          </li>
        </ul>
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
          <span>
            {formatNumber(reading?.market?.playerListings, 0)} player listings ·{' '}
            {formatNumber(reading?.market?.items, 0)} items
          </span>
          <b aria-hidden="true">↗</b>
        </Link>
        <Link className={css.card} href={`/map?map=${map}`}>
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
          <div className={css.inset}>
            <h3>{guildName}</h3>
            <p>
              {character.guild
                ? `Your rank: ${label(record(character.guild).rank, 'Not reported')}. Your place in the sietch.`
                : 'Your character has no reported guild membership. Join a guild in game to see it here.'}
            </p>
          </div>
          <Link href="/portal?view=guild">View guild ↗</Link>
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
        <section className={css.panel} aria-labelledby="character-summary">
          <h2 id="character-summary">Character</h2>
          <h3>{character.name}</h3>
          <p>
            Level {formatNumber(character.level, 0)} · {character.status}
          </p>
          <p>Equipment, progression and desert readiness.</p>
          <Link href="/portal?view=character">View dossier ↗</Link>
        </section>
      </div>
      <section className={css.wideSection} aria-labelledby="pulse-summary">
        <h2 className={css.sectionTitle} id="pulse-summary">
          World pulse | 24h
        </h2>
        <PopulationChart history={reading?.population} />
      </section>
      <section className={css.wideSection} id="landsraad" aria-labelledby="council-summary">
        <h2 className={css.sectionTitle} id="council-summary">
          Landsraad | This term
        </h2>
        <div className={`${css.panel} ${css.widePanel}`}>
          <h2>Landsraad {reading?.council ? `· Term ${reading.council.term}` : ''}</h2>
          {reading?.council ? (
            <>
              <div className={css.factions}>
                <div className={reading.council.atreides > reading.council.harkonnen ? css.leading : undefined}>
                  <span aria-hidden="true">⋀</span>
                  <strong>{formatNumber(reading.council.atreides, 0)}</strong>
                  <span>Atreides</span>
                </div>
                <span className={css.versus}>vs</span>
                <div className={reading.council.harkonnen > reading.council.atreides ? css.leading : undefined}>
                  <span aria-hidden="true">⋁</span>
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
