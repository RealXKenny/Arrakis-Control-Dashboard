import type { Metadata } from 'next';
import { PageHeader } from '../../../../components/ui/page-header';
import { requireSession } from '../../../../features/auth/server/session';
import { FairnessPanel } from '../../../../features/casino/components/fairness-panel';
import { fairnessState } from '../../../../features/casino/server/service';

export const metadata: Metadata = { title: 'Casino fairness' };

export default async function CasinoFairnessPage({ searchParams }: { searchParams: Promise<{ round?: string }> }) {
  const session = await requireSession();
  const [fairness, query] = await Promise.all([fairnessState(session), searchParams]);

  return (
    <>
      <PageHeader eyebrow="The Solaris Exchange" title="Fairness">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">Nothing here asks you to trust us. Check it.</p>
      </PageHeader>

      <section aria-labelledby="how" className="panel mb-8 p-6 text-sm leading-relaxed text-sand-300">
        <h2 id="how" className="eyebrow">
          How it works
        </h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5">
          <li>
            The server picks a secret server seed and shows you its SHA-256 commitment before you play. It cannot change
            the seed afterwards without the commitment no longer matching.
          </li>
          <li>
            Every random number is derived from HMAC-SHA256 with the server seed as the key and the message{' '}
            <code>clientSeed:nonce:block</code>. Whole numbers use rejection sampling, so there is no modulo bias.
          </li>
          <li>You may set your own client seed. Each round uses the next nonce and records its client seed.</li>
          <li>
            When you rotate, the old server seed is revealed. Hash it to check it matches the commitment, then replay
            any round from it. The verifier below does this for you and shows every input.
          </li>
          <li>
            For games with hidden state (Mines, Blackjack, Crash) the hidden positions, shoe and crash point are fixed
            from the seed at the start, and your actions are recorded, so the full round replays. Rotation is refused
            while a round is open, so a live round&apos;s seed is never revealed.
          </li>
        </ol>
      </section>

      <FairnessPanel initial={fairness} initialRound={query.round ?? ''} />
    </>
  );
}
