import { Card } from '../../../components/ui/card';
import { cardClass } from '../../../components/ui/control-styles';
import Link from 'next/link';
import type { ResolvedActivity } from '../server/resolve';
import { activityHref } from '../model';
import styles from './activity-views.module.css';
export function ActivityBar({ state, area }: { state: ResolvedActivity; area: 'portal' | 'inbox' | 'tasks' }) {
  return (
    <Card
      as="section"
      className={cardClass({ className: state.status === 'none' ? styles.strip : styles.card })}
      aria-label="Activity view"
    >
      {state.status === 'ok' ? (
        <>
          <h2>{state.view.name}</h2>
          <p>
            Saved activity settings. Source permissions are checked again. Local filter changes last until navigation;
            edit the saved definition to keep them.
          </p>
          <nav className={styles.actions} aria-label="Activity workspaces">
            {(['portal', 'inbox', 'tasks'] as const).map((page) => (
              <Link
                key={page}
                href={activityHref(page, state.view.id)}
                prefetch={false}
                aria-current={area === page ? 'page' : undefined}
              >
                {page === 'portal' ? 'Activity portal' : page === 'inbox' ? 'Activity inbox' : 'Activity tasks'}
              </Link>
            ))}
          </nav>
        </>
      ) : state.status !== 'none' ? (
        <p role="alert">
          {state.status === 'missing'
            ? 'This saved activity view is unavailable for your account.'
            : 'Saved activity settings could not be read. Reload before continuing.'}{' '}
          No saved activity has been applied.
        </p>
      ) : (
        <p>
          <span className={styles.stripLabel}>Activity views</span>
          Keep separate dashboard settings for building, exploration or your own activities.
        </p>
      )}
      <div className={styles.actions}>
        <Link href="/activity-views" prefetch={false}>
          Manage activity views
        </Link>
        {state.status !== 'none' && (
          <Link href={`/${area}`} prefetch={false}>
            Open normal {area}
          </Link>
        )}
      </div>
    </Card>
  );
}
