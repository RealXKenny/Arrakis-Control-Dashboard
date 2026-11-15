import Link from 'next/link';
import { navigationItemFor } from '../../../components/navigation/nav-config';
import styles from './quick-actions.module.css';

export function PortalQuickActions({ guildState }: { guildState: 'member' | 'solo' | 'unknown' }) {
  const storage = navigationItemFor('storage')?.href;
  const holdings = navigationItemFor('holdings')?.href;
  const guild = navigationItemFor('my-guild')?.href;
  return (
    <section className={styles.root} aria-labelledby="portal-quick-actions">
      <div className={styles.heading}>
        <p>Field essentials</p>
        <h2 id="portal-quick-actions">Quick actions</h2>
        <p>Prepare a search, check your bases or read the team briefing. Each workspace checks your access afresh.</p>
      </div>
      <div className={styles.grid}>
        {storage && (
          <article className={styles.card} aria-label="Find supplies">
            <span aria-hidden="true" className={styles.number}>
              01
            </span>
            <h3>Find supplies</h3>
            <p>Search your character and authorized base or vehicle containers. No guild required.</p>
            <form action={`${storage}#finder-title`} method="get" className={styles.form}>
              <label htmlFor="quick-supply-query">Item name or template</label>
              <input
                id="quick-supply-query"
                type="search"
                name="find"
                maxLength={128}
                required
                placeholder="e.g. Spice"
              />
              <button type="submit" className="btn btn-primary">
                Prepare supply search
              </button>
            </form>
            <p className={styles.note}>
              Opens a prefilled finder. Choose Find items there to start the read-only search.
            </p>
          </article>
        )}
        {holdings && (
          <article className={styles.card} aria-label="Check bases">
            <span aria-hidden="true" className={styles.number}>
              02
            </span>
            <h3>Check bases</h3>
            <p>Open your holdings to inspect reported water, storage and base details.</p>
            <div className={styles.links}>
              <Link href={holdings} prefetch={false}>
                Check owned bases <span aria-hidden="true">↗</span>
              </Link>
              <Link href={`${holdings}?view=shared`} prefetch={false}>
                Check shared bases <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p className={styles.note}>
              Only bases available to your linked character appear. Missing readings stay unknown.
            </p>
          </article>
        )}
        {guild && (
          <article className={styles.card} aria-label="Operation briefings">
            <span aria-hidden="true" className={styles.number}>
              03
            </span>
            <h3>Operation briefings</h3>
            <p>Read the meeting point, schedule, roles and instructions in your guild operations planner.</p>
            <div className={styles.links}>
              <Link href={`${guild}?tab=operations`} prefetch={false}>
                Read operation briefings <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <p className={styles.note}>
              {guildState === 'solo'
                ? 'No guild is reported for your character. Guild membership is required for private briefings; supply and base actions work independently.'
                : guildState === 'unknown'
                  ? 'Guild access is not confirmed here. The destination verifies your linked character and current membership.'
                  : 'Your current guild membership is verified again before private operations are shown. Opening a briefing never signs you up.'}
            </p>
          </article>
        )}
      </div>
    </section>
  );
}
