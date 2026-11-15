import type { Metadata } from 'next';
import { requireSession } from '../../auth/server/session';
import { PageHeader, Notice } from '../../../components/ui/page-header';
import { AppError } from '../../../lib/errors';
import { privacyNames, type PublicShare } from '../model';
import { readSharedPrivacy } from '../server/store';
import { privacyBudget } from '../server/http';
import { CardContent } from './card-content';
import styles from './privacy.module.css';
export const metadata: Metadata = { title: 'Member sharing' };
export default async function SharedPrivacyPage({ params }: { params: Promise<{ shareId: string }> }) {
  const session = await requireSession();
  let share: PublicShare | null = null;
  let failure = 'This sharing view is temporarily unavailable.';
  try {
    await privacyBudget(session.user.id, true);
    share = await readSharedPrivacy((await params).shareId);
  } catch (error) {
    if (error instanceof AppError && error.expose) failure = error.message;
  }
  return (
    <>
      <PageHeader eyebrow="Voluntarily shared with dashboard members" title="Member sharing" />
      <section className={styles.root} aria-label="Voluntary member cards">
        <p className={styles.note}>
          These are self-reported notes, not verified identity, location, crafting unlocks, inventory or delivery
          evidence. Only published, unexpired cards appear on a fresh read. A member may change or revoke them.
        </p>
        {share ? (
          <div className={styles.grid}>
            {share.cards.map((card) => (
              <article
                key={card.category}
                className={styles.card}
                aria-label={`Shared ${privacyNames[card.category].toLowerCase()}`}
              >
                <h2>{privacyNames[card.category]}</h2>
                <CardContent card={card} />
                <p>
                  Published {card.publishedAt}. Expires {card.expiresAt}.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <Notice title="Member link unavailable">{failure}</Notice>
        )}
      </section>
    </>
  );
}
