/**
 * Client-safe description of the Solaris Exchange: the six games, their limits and the rules shown to
 * players. No server imports. Keep the limits in step with the game modules in `games/`; the server is
 * authoritative and rejects anything outside them.
 */

export const CASINO_NAME = 'The Solaris Exchange';
export const CASINO_TAGLINE = 'Fortune Favors the Bold on Arrakis.';
/** Shown wherever a wager can be placed. These are real stakes, and the notice says so plainly. */
export const STAKES_NOTICE =
  'Every wager here is real in-game Solaris. You can lose what you stake. Only play with what you can afford to lose.';

export type GameId =
  'emperors-hand' | 'spice-wheel' | 'fate-of-arrakis' | 'spice-harvest' | 'ornithopter-run' | 'great-houses';

export type GameInfo = {
  id: GameId;
  name: string;
  genre: string;
  tagline: string;
  min: number;
  max: number;
  /** Plain-language odds and house edge, shown on the card and in the rules. */
  odds: string;
  rules: readonly string[];
};

export const GAMES: readonly GameInfo[] = [
  {
    id: 'emperors-hand',
    name: "The Emperor's Hand",
    genre: 'Blackjack',
    tagline: 'Outplay the dealer with the poise of a Great House.',
    min: 10,
    max: 50_000,
    odds: 'Blackjack pays 3:2. Dealer stands on all 17s. Six decks, shuffled every round.',
    rules: [
      'Get closer to 21 than the dealer without going over.',
      'Blackjack (a two-card 21) pays 3:2, rounded down; a 21 reached any other way pays 1:1.',
      'The dealer stands on all 17s, including soft 17, and checks for blackjack on an ace or ten.',
      'Double down on any first two cards, also after a split (not split aces): one card, then you stand.',
      'Split a pair of the same rank once. Split aces receive one card each. No re-split.',
      'No insurance and no surrender. A fresh six-deck shoe is shuffled for every round.',
    ],
  },
  {
    id: 'spice-wheel',
    name: 'The Spice Wheel',
    genre: 'Roulette',
    tagline: 'An ancient navigation instrument. One zero. Every number equal.',
    min: 10,
    max: 100_000,
    odds: 'European single-zero wheel. House edge 2.70% on every bet.',
    rules: [
      'The wheel has 37 pockets, 0 to 36, each with probability 1/37.',
      'Place up to 20 bets per spin. Straight 35:1; colour, parity and high/low 1:1; dozens and columns 2:1.',
      'Zero loses every outside bet (no en prison, no la partage).',
      'Every bet type returns 36/37 (97.30%) on average.',
    ],
  },
  {
    id: 'fate-of-arrakis',
    name: 'Fate of Arrakis',
    genre: 'Dice',
    tagline: 'Read the wind. Choose your odds.',
    min: 100,
    max: 100_000,
    odds: 'Choose any chance from 1% to 98%. Payout = 0.99 divided by your chance.',
    rules: [
      'The roll is 0.00 to 99.99, every value equally likely.',
      'Roll under your target to win, or roll over it. Landing exactly on the target loses.',
      'Your chance and multiplier are shown before you roll. Return to player is 98.99% to 99%.',
    ],
  },
  {
    id: 'spice-harvest',
    name: 'Spice Harvest',
    genre: 'Mines',
    tagline: 'Reap the melange. Mind the worm.',
    min: 10,
    max: 100_000,
    odds: 'You choose 1 to 24 hazards on a 5 by 5 field. Each safe tile raises the payout. 1% edge.',
    rules: [
      'The field has 25 tiles. You choose how many hide sandworm hazards (1 to 24).',
      'Reveal tiles one at a time. A spice cache raises your multiplier; a hazard ends the round and loses your wager.',
      'Cash out after at least one safe reveal. Clearing every safe tile cashes out automatically.',
      'Hazard positions are chosen before your first reveal and are hidden until the round ends.',
    ],
  },
  {
    id: 'ornithopter-run',
    name: 'Ornithopter Run',
    genre: 'Crash',
    tagline: 'Outrun the Coriolis storm. Cash out in time.',
    min: 10,
    max: 100_000,
    odds: 'Any cash-out target returns 99% on average. About 1% of flights crash instantly. Capped at 1,000x.',
    rules: [
      'The multiplier climbs until the storm catches the ornithopter. Cash out before then to win.',
      'The crash point is fixed when the round starts and hidden until it ends.',
      'Timing is decided by the server clock only. Your screen is a display; network delay can make you late.',
      'If the storm catches you first, the round is lost, whether or not you were watching.',
    ],
  },
  {
    id: 'great-houses',
    name: 'The Great Houses',
    genre: 'Coin flip',
    tagline: 'Two Houses. One coin. Choose your side.',
    min: 10,
    max: 100_000,
    odds: '50% chance. A win pays 1.96x (98% return, 2% house edge).',
    rules: [
      'Choose House Scarab or House Crescent.',
      'The coin lands on each side with probability exactly 1/2. A win pays 1.96x, rounded down.',
    ],
  },
] as const;

export const gameById = (id: string): GameInfo | undefined => GAMES.find((game) => game.id === id);

/** `12345` or `"12345"` to `12,345`. */
export function formatCredits(value: string | number | bigint): string {
  try {
    return BigInt(value).toLocaleString('en-US');
  } catch {
    return '0';
  }
}

export type WalletSnapshot = {
  solaris: { available: string; reserved: string };
  pausedUntil: number | null;
  /** False while the server-side switch is off: nothing can be wagered or moved. */
  enabled: boolean;
  limits: { maxWager: string; maxPayout: string };
};

export type TransferState =
  'created' | 'debit_sent' | 'credit_sent' | 'game_applied' | 'needs_reconciliation' | 'completed' | 'failed';

export type TransferRow = {
  id: string;
  kind: 'deposit' | 'withdrawal';
  amount: string;
  state: TransferState;
  failureCode: string | null;
  createdAt: number;
  updatedAt: number;
};

/** What a transfer's state means to the member, in plain words. */
export function transferMessage(row: Pick<TransferRow, 'kind' | 'state' | 'failureCode'>): string {
  const deposit = row.kind === 'deposit';
  switch (row.state) {
    case 'completed':
      return deposit
        ? 'Done. The Solaris is in your casino wallet.'
        : 'Done. The Solaris will be in your game account the next time you join the game.';
    case 'created':
    case 'debit_sent':
    case 'credit_sent':
    case 'game_applied':
      return 'In progress. This usually takes a moment; refresh to see the result.';
    case 'needs_reconciliation':
      return deposit
        ? 'We could not confirm whether the game took the Solaris. Nothing more will be sent automatically. An administrator will check your balance and finish this. Your wallet is not charged until then.'
        : 'We could not confirm whether the game received the Solaris. It stays reserved here, and nothing more will be sent automatically, until an administrator checks and finishes this.';
    case 'failed':
      return failureText(row.failureCode);
  }
}

function failureText(code: string | null): string {
  switch (code) {
    case 'INSUFFICIENT_GAME_BALANCE':
      return 'Not enough Solaris in your game account. Nothing was moved.';
    case 'INSUFFICIENT_WALLET_FUNDS':
      return 'Not enough available Solaris in your casino wallet. Nothing was moved.';
    case 'BALANCE_UNAVAILABLE':
      return 'The game balance could not be read, so nothing was moved. Try again shortly.';
    case 'CONSOLE_REJECTED':
      return 'The game refused the change. Nothing was moved.';
    case 'RECONCILED_NOT_APPLIED':
      return 'An administrator confirmed the game did not apply the change. Nothing was moved.';
    default:
      return 'This transfer did not complete. Nothing was moved.';
  }
}

export type { RoundView } from './engine/types';

export type HistoryRow = {
  id: string;
  game: string;
  status: string;
  wager: string;
  stake: string;
  createdAt: number;
  payout: string | null;
  net: string | null;
};
