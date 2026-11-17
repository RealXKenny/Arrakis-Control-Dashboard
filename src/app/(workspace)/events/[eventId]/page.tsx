import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageHeader, Notice } from '../../../../components/ui/page-header';
import { requireSession } from '../../../../features/auth/server/session';
import { listCommunityEvents } from '../../../../features/events/server/store';
import { canReviewEventSubmissions } from '../../../../features/events/server/review-authorization';
import { eventSubmissionOpen, readEventSubmissions } from '../../../../features/events/server/submissions-store';
import { submissionView, type EventSubmissionView } from '../../../../features/events/submissions';
import { SubmissionGallery } from '../../../../features/events/components/submission-gallery';

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const event = (await listCommunityEvents().catch(() => [])).find((item) => item.id === eventId);
  return { title: event ? `${event.title} gallery` : 'Event gallery' };
}

export default async function EventGalleryPage({ params }: { params: Promise<{ eventId: string }> }) {
  const session = await requireSession();
  const { eventId } = await params;
  const event = (await listCommunityEvents().catch(() => [])).find((item) => item.id === eventId);
  if (!event) notFound();
  const reviewer = await canReviewEventSubmissions(session);
  let submissions: EventSubmissionView[] | null = null;
  try {
    submissions = (await readEventSubmissions(event.id)).flatMap((record) => {
      const view = submissionView(event.id, record, { owner: session.user.id, reviewer });
      return view ? [view] : [];
    });
  } catch {
    submissions = null;
  }
  const submissionOpen = Boolean(eventSubmissionOpen(event));
  return (
    <>
      <PageHeader eyebrow="Evidence and judging" title={event.title}>
        <p className="max-w-md text-sm text-sand-400">
          Reviewed submissions and separately confirmed judging results. <Link href="/events">Back to events</Link>
        </p>
      </PageHeader>
      {submissions ? (
        <SubmissionGallery
          eventId={event.id}
          initial={submissions}
          canReview={reviewer}
          submissionOpen={submissionOpen}
        />
      ) : (
        <Notice title="Submissions are temporarily unavailable" tone="warn">
          The gallery could not be loaded. Refresh the page to try again.
        </Notice>
      )}
    </>
  );
}
