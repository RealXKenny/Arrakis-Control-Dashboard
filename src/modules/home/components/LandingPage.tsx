import Link from 'next/link';
import DashboardShell from '../../../components/DashboardShell';
import { useServerStatus } from '../hooks/useServerStatus';
import css from '../home.module.css';

export default function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();
  return (
    <DashboardShell
      brand="Crimson Skies"
      subtitle="Arrakis field companion"
      navigation={[
        { label: 'Dashboard', group: 'Command', href: '/', active: true },
      ]}
      actions={
        <>
          {!isAuthenticated && <a href="/auth/login">Connect Discord</a>}
          <a href="https://discord.gg/crimsonskies" target="_blank" rel="noreferrer">
            Join Discord
          </a>
          <Link href="/portal">Open portal ↗</Link>
        </>
      }
    >
      <div className={css.reading}>
        <span>Crimson Skies / Dune: Awakening</span>
        <span>
          {serverStatusError
            ? 'Telemetry unavailable'
            : activePlayers == null
              ? 'Reading server…'
              : '● Server connected'}
        </span>
      </div>
      <section className={css.hero}>
        <div className={css.heroCopy}>
          <p className={css.eyebrow}>Your field companion for Arrakis</p>
          <h1>
            Know the sand.
            <br />
            <em>Own your signal.</em>
          </h1>
          <p className={css.description}>
            A clear view of your character, territory, fleet, and the world around you—so every step into the desert
            starts with better intelligence.
          </p>
          <div className={css.actions}>
            {!isAuthenticated && <a href="/auth/login">Connect with Discord →</a>}
            <Link href="/portal">Open your portal ↗</Link>
            <a href="https://discord.gg/crimsonskies" target="_blank" rel="noreferrer">
              Join Discord ↗
            </a>
          </div>
        </div>
        <div className={css.heroVisual} aria-hidden="true">
          <div className={css.visualGlow} />
          <div className={css.contours}>
            <span>◈</span>
          </div>
          <div className={css.signalCard}>
            <span>ARRAKIS // FIELD SIGNAL</span>
            <strong>READY</strong>
            <small>Live intelligence for the prepared.</small>
          </div>
        </div>
      </section>
      <div className={css.stats}>
        <article>
          <span>World pulse</span>
          <strong>{activePlayers ?? '—'}</strong>
          <p>Players online</p>
        </article>
        <article>
          <span>The community</span>
          <strong>{totalPlayers ?? '—'}</strong>
          <p>Known characters</p>
        </article>
      </div>
      <section className={css.community}>
        <div className={css.communityCopy}>
          <p className={css.eyebrow}>The Crimson Skies community</p>
          <h2>Find your crew before you find the spice.</h2>
          <p>
            Join the conversation, share your next run, and stay close to the people shaping life across Arrakis.
          </p>
          <a className={css.discordButton} href="https://discord.gg/crimsonskies" target="_blank" rel="noreferrer">
            Join Discord ↗
          </a>
        </div>
        <div className={css.discordWidget}>
          <iframe
            title="Crimson Skies Discord community"
            src="https://discord.com/widget?id=1532230917249302588&theme=dark"
            width="350"
            height="500"
            allowTransparency
            frameBorder="0"
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          />
        </div>
      </section>
    </DashboardShell>
  );
}
