import type { Metadata } from 'next';
import Link from 'next/link';
import { Notice, PageHeader } from '../../../components/ui/page-header';
import { requireSession } from '../../../features/auth/server/session';
import { GameArt } from '../../../features/casino/components/game-art';
import {
  CASINO_NAME,
  CASINO_TAGLINE,
  STAKES_NOTICE,
  GAMES,
  formatCredits,
  gameById,
} from '../../../features/casino/contracts';
import { casinoHistory, loadWallet } from '../../../features/casino/server/service';

export const metadata: Metadata = { title: CASINO_NAME };

export default async function CasinoPage() {
  const session = await requireSession();
  const [wallet, recent] = await Promise.all([loadWallet(session), casinoHistory(session, 6)]);
  const featured = GAMES[0]!;

  return (
    <>
      <PageHeader eyebrow="Real Solaris at stake" title={CASINO_NAME}>
        <p className="max-w-md text-sm leading-relaxed text-sand-400">{CASINO_TAGLINE}</p>
      </PageHeader>

      {wallet.enabled ? (
        <Notice tone="warn" title="Real Solaris">
          {STAKES_NOTICE}
        </Notice>
      ) : (
        <Notice tone="warn" title="The Solaris Exchange is closed">
          Real Solaris play is not switched on for this server. You can look around, but no wagers or transfers are
          possible until an administrator enables it.
        </Notice>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="featured" className="panel flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <GameArt id={featured.id} className="size-28 shrink-0" />
          <div>
            <p className="eyebrow">Featured table</p>
            <h2 id="featured" className="mt-2 text-xl">
              {featured.name}
            </h2>
            <p className="mt-1 text-sm text-sand-400">{featured.tagline}</p>
            <p className="mt-2 text-xs text-sand-500">{featured.odds}</p>
            <Link href={`/casino/games/${featured.id}`} className="btn btn-primary mt-4">
              Take a seat
            </Link>
          </div>
        </section>

        <section aria-labelledby="balance" className="panel p-6">
          <p className="eyebrow">Your wallet</p>
          <h2 id="balance" className="sr-only">
            Wallet summary
          </h2>
          <dl className="mt-3 grid gap-3 text-sm">
            <div>
              <dt className="text-xs text-sand-500">Casino wallet</dt>
              <dd className="text-2xl font-bold text-sand-50">{formatCredits(wallet.solaris.available)} Solaris</dd>
              {wallet.solaris.reserved !== '0' && (
                <dd className="text-xs text-sand-500">{formatCredits(wallet.solaris.reserved)} held in play</dd>
              )}
            </div>
          </dl>
          <Link href="/casino/wallet" className="btn btn-ghost mt-4">
            Open wallet
          </Link>
        </section>
      </div>

      <section aria-labelledby="games" className="mt-10">
        <h2 id="games" className="eyebrow">
          The tables
        </h2>
        <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {GAMES.map((game) => (
            <li key={game.id}>
              <Link
                href={`/casino/games/${game.id}`}
                className="panel group flex h-full flex-col gap-3 p-5 transition-colors hover:border-spice-400"
              >
                <GameArt id={game.id} />
                <div>
                  <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-spice-400">{game.genre}</p>
                  <h3 className="mt-1 text-lg group-hover:text-spice-300">{game.name}</h3>
                  <p className="mt-1 text-sm text-sand-400">{game.tagline}</p>
                </div>
                <p className="mt-auto text-xs text-sand-500">
                  {game.odds} Wager {formatCredits(game.min)} to {formatCredits(game.max)}.
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section aria-labelledby="recent" className="panel p-6">
          <h2 id="recent" className="eyebrow">
            Your recent rounds
          </h2>
          {recent.length === 0 ? (
            <p className="mt-3 text-sm text-sand-500">No rounds yet. Pick a table to start.</p>
          ) : (
            <ul className="mt-3 divide-y divide-sand-200/10 text-sm">
              {recent.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-sand-200">{gameById(row.game)?.name ?? row.game}</span>
                  <span className={row.net && BigInt(row.net) > 0n ? 'text-spice-300' : 'text-sand-400'}>
                    {row.status === 'open'
                      ? 'In play'
                      : row.net === null
                        ? row.status
                        : `${BigInt(row.net) > 0n ? '+' : ''}${formatCredits(row.net)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/casino/history" className="mt-3 inline-block text-sm underline">
            All history
          </Link>
        </section>
        <section aria-labelledby="trust" className="panel p-6">
          <h2 id="trust" className="eyebrow">
            Fairness and help
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-sand-300">
            Every outcome is decided on the server from a seed committed before you play, and can be verified once the
            seed is retired. Odds and house edges are published for every table.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/casino/fairness" className="btn btn-ghost">
              How fairness works
            </Link>
            <Link href="/casino/rules" className="btn btn-ghost">
              Rules and help
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
