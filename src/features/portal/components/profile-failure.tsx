import Link from 'next/link';
import type { PortalResult } from '../server/load';
import { Notice } from '../../../components/ui/page-header';

type Failure = Exclude<PortalResult, { status: 'ok' }>;

/** One place that explains every way loading the player's profile can fail. */
export function ProfileFailure({ result }: { result: Failure }) {
  if (result.status === 'unlinked') {
    return (
      <Notice title="Link your character">
        {result.message ?? 'Link your Dune character through the Discord bot to see your holdings and progress.'}
      </Notice>
    );
  }
  if (result.status === 'limited') {
    return (
      <Notice tone="warn" title="Slow down, traveller">
        Too many reads from your connection. Try again in {result.retryAfter} seconds.
      </Notice>
    );
  }
  return (
    <Notice tone="warn" title="Character unavailable">
      {result.message}{' '}
      <Link href="/login" prefetch={false} className="text-spice-300 underline">
        Sign in again
      </Link>
    </Notice>
  );
}
