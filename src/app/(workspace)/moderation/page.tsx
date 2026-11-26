import type { Metadata } from 'next';
import { PageHeader, Notice } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { ModerationCases } from '../../../features/moderation/components/moderation-cases';
import { isModerator } from '../../../features/moderation/server/authorization';
import { readModerationCases } from '../../../features/moderation/server/cases-store';
import { moderationCaseView } from '../../../features/moderation/model';

export const metadata: Metadata = { title: 'Moderator cases' };

export default async function ModerationPage() {
  const session = await requireSession();
  if (!(await isModerator(session))) {
    return (
      <Notice title="Moderator access could not be verified" tone="warn">
        A current moderator Discord role is required. Case evidence was not loaded.
      </Notice>
    );
  }
  const cases = await readModerationCases().catch(() => null);
  return (
    <>
      <PageHeader eyebrow="Least-privilege review" title="Moderator cases">
        <p className="max-w-md text-sm text-sand-400">
          Review evidence, assign cases and record decisions. No game enforcement happens here.
        </p>
      </PageHeader>
      {cases ? (
        <ModerationCases initial={cases.map(moderationCaseView)} />
      ) : (
        <Notice title="Moderation cases are temporarily unavailable" tone="warn">
          The case queue could not be loaded. Refresh the page to try again.
        </Notice>
      )}
    </>
  );
}
