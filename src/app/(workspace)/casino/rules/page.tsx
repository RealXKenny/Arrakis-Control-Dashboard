import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '../../../../components/ui/page-header';
import { requireSession } from '../../../../features/auth/server/session';
import { GAMES, STAKES_NOTICE, formatCredits } from '../../../../features/casino/contracts';

export const metadata: Metadata = { title: 'Casino rules and help' };

export default async function CasinoRulesPage() {
  await requireSession();
  return (
    <>
      <PageHeader eyebrow="The Solaris Exchange" title="Rules and help">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Odds, payouts and house edges for every table, stated plainly.
        </p>
      </PageHeader>

      <section aria-labelledby="basics" className="panel mb-8 p-6 text-sm leading-relaxed text-sand-300">
        <h2 id="basics" className="eyebrow">
          The basics
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5">
          <li>{STAKES_NOTICE}</li>
          <li>
            Solaris moves between your game character and your casino wallet only by deposit and withdrawal. Each
            transfer is confirmed with the game, and if the game does not answer, nothing is guessed: an administrator
            checks your balance and finishes it, and your funds stay safe in the meantime.
          </li>
          <li>No single wager or round can exceed the table limits shown in your wallet.</li>
          <li>
            Every outcome is decided by the server. Your browser only displays it and cannot change a result or a
            payout.
          </li>
          <li>
            Play is meant to be fun. You can set a break from the{' '}
            <Link href="/casino/wallet#limits" className="underline">
              wallet
            </Link>
            , and turn on a reminder at any table. If play stops being fun, stop.
          </li>
          <li>A request repeated by accident (a double click, a retry) never starts two rounds or pays twice.</li>
          <li>
            If your connection drops during a round, return to that table: your unfinished round resumes. Unfinished
            rounds are refunded after 24 hours.
          </li>
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {GAMES.map((game) => (
          <section key={game.id} aria-labelledby={`rules-${game.id}`} className="panel p-6">
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-spice-400">{game.genre}</p>
            <h2 id={`rules-${game.id}`} className="mt-1 text-lg">
              <Link href={`/casino/games/${game.id}`} className="hover:text-spice-300">
                {game.name}
              </Link>
            </h2>
            <p className="mt-2 text-sm text-sand-100">{game.odds}</p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-sand-300">
              {game.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-sand-500">
              Wager {formatCredits(game.min)} to {formatCredits(game.max)} Solaris (or the server limit, if lower).
            </p>
          </section>
        ))}
      </div>
    </>
  );
}
