import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '../../../../../features/auth/server/session';
import { GameTable } from '../../../../../features/casino/components/game-table';
import { CASINO_NAME, gameById } from '../../../../../features/casino/contracts';
import { loadWallet } from '../../../../../features/casino/server/service';

export async function generateMetadata({ params }: { params: Promise<{ game: string }> }): Promise<Metadata> {
  const game = gameById((await params).game);
  return { title: game ? `${game.name} · ${CASINO_NAME}` : CASINO_NAME };
}

export default async function GamePage({ params }: { params: Promise<{ game: string }> }) {
  const session = await requireSession();
  const game = gameById((await params).game);
  if (!game) notFound();
  const wallet = await loadWallet(session);

  return (
    <>
      <p className="mb-6 text-sm">
        <Link href="/casino" className="text-sand-400 underline hover:text-spice-300">
          {CASINO_NAME}
        </Link>
      </p>
      <GameTable game={game} initialWallet={wallet} />
    </>
  );
}
