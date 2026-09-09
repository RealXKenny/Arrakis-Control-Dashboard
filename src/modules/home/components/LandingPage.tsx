import Link from 'next/link';
import DashboardShell from '../../../components/DashboardShell';
import { useServerStatus } from '../hooks/useServerStatus';
import css from '../home.module.css';
import { useSiteConfig } from '../../../components/SiteConfigProvider';

export default function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const site = useSiteConfig();
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();
  return (
    <DashboardShell
      brand={site.name}
      subtitle={site.subtitle}
      navigation={[{ label: 'Dashboard', group: 'Command', href: '/', active: true }]}
      actions={
        <>
          {!isAuthenticated && <a href="/auth/login">Connect Discord</a>}
          <a href={site.discordInviteUrl} target="_blank" rel="noreferrer">
            Join Discord
          </a>
          <Link href="/portal">Open portal ↗</Link>
        </>
      }
    >
      <div className={css.reading}>
        <span>{site.name} / Dune: Awakening</span>
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
          <p className={css.eyebrow}>{site.hero.eyebrow}</p>
          <h1>
            {site.hero.title}
            <br />
            <em>{site.hero.accent}</em>
          </h1>
          <p className={css.description}>{site.hero.description}</p>
          <div className={css.actions}>
            {!isAuthenticated && <a href="/auth/login">Connect with Discord →</a>}
            <Link href="/portal">Open your portal ↗</Link>
            <a href={site.discordInviteUrl} target="_blank" rel="noreferrer">
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
          <p className={css.eyebrow}>The {site.name} community</p>
          <h2>{site.community.title}</h2>
          <p>{site.community.description}</p>
          <a className={css.discordButton} href={site.discordInviteUrl} target="_blank" rel="noreferrer">
            Join Discord ↗
          </a>
        </div>
        {site.discordWidgetEnabled && site.discordWidgetGuildId && (
          <div className={css.discordWidget}>
            <iframe
              title={`${site.name} Discord community`}
              src={`https://discord.com/widget?id=${encodeURIComponent(site.discordWidgetGuildId)}&theme=dark`}
              width="350"
              height="500"
              allowTransparency
              frameBorder="0"
              sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
            />
          </div>
        )}
      </section>
    </DashboardShell>
  );
}
