import Link from 'next/link';
import DashboardShell from '../../../components/DashboardShell';
import { useServerStatus } from '../hooks/useServerStatus';
import css from '../home.module.css';

export default function LandingPage({
  isAuthenticated = false,
  isAdmin = false,
}: {
  isAuthenticated?: boolean;
  isAdmin?: boolean;
}) {
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();
  return (
    <DashboardShell
      brand="Crimson Skies"
      subtitle="Community workspace"
      navigation={[{ label: 'Overview', group: 'Workspace', href: '/', active: true }]}
      actions={
        <>
          {isAdmin && <Link href="/admin">Administration</Link>}
          {!isAuthenticated && <a href="/auth/login">Connect Discord</a>}
          <a href="https://discord.gg/crimsonskies" target="_blank" rel="noreferrer">
            Join Discord
          </a>
          <Link href="/portal">Open portal ↗</Link>
        </>
      }
    >
      <div className={css.reading}>
        <span>Welcome to your workspace</span>
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
          <p className={css.eyebrow}>One community. Everything connected.</p>
          <h1>
            A clearer view.
            <br />
            <em>More possibilities.</em>
          </h1>
          <p className={css.description}>
            Your character, community, holdings, and live world data. A thoughtfully organized workspace that keeps
            everything within reach.
          </p>
          <div className={css.actions}>
            {!isAuthenticated && <a href="/auth/login">Connect with Discord →</a>}
            <Link href="/portal">Open your portal ↗</Link>
          </div>
        </div>
        <aside className={css.workspace} aria-label="Explore your workspace">
          <div className={css.workspaceHeader}>
            <span className={css.workspaceIcon} aria-hidden="true">
              ↗
            </span>
            <div>
              <strong>Your workspace</strong>
              <small>A little less searching. A lot more clarity.</small>
            </div>
          </div>
          {[
            {
              title: 'Character & inventory',
              description: 'Your progress, gear, and personal storage',
              view: 'character',
              icon: '01',
            },
            { title: 'Bases & vehicles', description: 'Everything you own, in one place', view: 'bases', icon: '02' },
            {
              title: 'Live maps',
              description: 'Explore the world with current information',
              view: 'hagga',
              icon: '03',
            },
            {
              title: 'Community exchange',
              description: 'Browse listings and compare prices',
              view: 'market',
              icon: '04',
            },
          ].map((item) => (
            <Link key={item.view} href={`/portal?view=${item.view}`} className={css.workspaceLink}>
              <span className={css.linkIcon} aria-hidden="true">
                {item.icon}
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <span aria-hidden="true">↗</span>
            </Link>
          ))}
          <p className={css.workspaceNote}>Secure access through your Discord account</p>
        </aside>
      </section>
      <div className={css.stats}>
        <article>
          <span>Live activity</span>
          <strong>{activePlayers ?? '—'}</strong>
          <p>Players online</p>
        </article>
        <article>
          <span>The community</span>
          <strong>{totalPlayers ?? '—'}</strong>
          <p>Characters in the community</p>
        </article>
      </div>
      <section className={css.community}>
        <div className={css.communityCopy}>
          <p className={css.eyebrow}>The Crimson Skies community</p>
          <h2>
            Good company.
            <br />
            Better together.
          </h2>
          <p>Make plans, share discoveries, and catch up with your community. The conversation continues on Discord.</p>
          <a className={css.discordButton} href="https://discord.gg/crimsonskies" target="_blank" rel="noreferrer">
            Join Discord ↗
          </a>
        </div>
        <aside className={css.communityCard} aria-label="Crimson Skies community">
          <span className={css.communityMark} aria-hidden="true">
            CS
          </span>
          <strong>Crimson Skies</strong>
          <p>Your community on Discord</p>
          <div>
            <span>Plan together</span>
            <span>Share discoveries</span>
            <span>Stay in the loop</span>
          </div>
        </aside>
      </section>
    </DashboardShell>
  );
}
