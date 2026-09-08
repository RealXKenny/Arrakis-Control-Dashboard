import Link from 'next/link';
import DashboardShell from '../../../components/DashboardShell';
import { useServerStatus } from '../hooks/useServerStatus';
import css from '../home.module.css';

export default function LandingPage() {
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();
  return (
    <DashboardShell
      brand="Crimson Skies"
      subtitle="Arrakis field companion"
      navigation={[
        { label: 'Dashboard', group: 'Command', href: '/', active: true },
        { label: 'Character', group: 'Holdings', href: '/portal' },
        { label: 'Hagga Basin', group: 'Desert', href: '/portal?view=hagga' },
        { label: 'Deep Desert', group: 'Desert', href: '/portal?view=deep-desert' },
        { label: 'Exchange', group: 'Economy', href: '/portal?view=market' },
      ]}
      actions={<a href="/auth/login">Connect Discord</a>}
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
        <p className={css.eyebrow}>The desert rewards the prepared</p>
        <h1>
          Your signal.
          <br />
          <em>Across Arrakis.</em>
        </h1>
        <p className={css.description}>
          Know where you stand before you step onto the sand. Your character, your strongholds, your fleet, and the
          market—in one field companion.
        </p>
        <div className={css.actions}>
          <a href="/auth/login">Connect with Discord →</a>
          <Link href="/portal">Open your portal ↗</Link>
        </div>
        <div className={css.contours} aria-hidden="true">
          <span>◈</span>
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
        <article>
          <span>Your connection</span>
          <strong>12 hours</strong>
          <p>Session lifetime after sign-in</p>
        </article>
      </div>
      <h2 className={css.sectionTitle}>Your field instruments</h2>
      <div className={css.cards}>
        {[
          ['01', 'Character & resources', 'Health, hydration, progression and balances.', '/portal'],
          ['02', 'Territory & fleet', 'Inspect your owned and shared bases and vehicles.', '/portal?view=bases'],
          ['03', 'CHOAM Exchange', 'Read active listings and search market prices.', '/portal?view=market'],
          ['04', 'Desert reconnaissance', 'Explore Hagga Basin and the Deep Desert.', '/portal?view=hagga'],
        ].map(([number, title, description, href]) => (
          <Link href={href} key={number}>
            <small>{number} / FIELD INSTRUMENT</small>
            <h3>{title}</h3>
            <p>{description}</p>
            <span>Explore ↗</span>
          </Link>
        ))}
      </div>
    </DashboardShell>
  );
}
