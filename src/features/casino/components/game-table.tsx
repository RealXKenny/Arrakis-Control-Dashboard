'use client';

import { Notice } from '../../../components/ui/page-header';
import { type GameInfo, type WalletSnapshot } from '../contracts';
import { BlackjackTable } from './blackjack-table';
import { CoinFlipTable } from './coin-flip-table';
import { CrashTable } from './crash-table';
import { DiceTable } from './dice-table';
import { MinesTable } from './mines-table';
import { GameFrame } from './parts';
import { RouletteTable } from './roulette-table';
import { useWallet } from './use-casino';

/** Loads the member's wallet once, then renders the chosen game inside the shared frame. */
export function GameTable({ game, initialWallet }: { game: GameInfo; initialWallet: WalletSnapshot }) {
  const { wallet, refresh } = useWallet(initialWallet);
  if (wallet && !wallet.enabled)
    return (
      <Notice tone="warn" title="The Solaris Exchange is closed">
        Real Solaris play is not switched on for this server, so no wagers can be placed. Ask a server administrator.
      </Notice>
    );
  const props = {
    game,
    paused: Boolean(wallet?.pausedUntil),
    maxWager: wallet ? Math.min(game.max, Number(wallet.limits.maxWager)) : game.max,
    onSettled: () => void refresh(),
  };
  return (
    <GameFrame game={game} wallet={wallet}>
      {game.id === 'emperors-hand' && <BlackjackTable {...props} />}
      {game.id === 'spice-wheel' && <RouletteTable {...props} />}
      {game.id === 'fate-of-arrakis' && <DiceTable {...props} />}
      {game.id === 'spice-harvest' && <MinesTable {...props} />}
      {game.id === 'ornithopter-run' && <CrashTable {...props} />}
      {game.id === 'great-houses' && <CoinFlipTable {...props} />}
    </GameFrame>
  );
}
