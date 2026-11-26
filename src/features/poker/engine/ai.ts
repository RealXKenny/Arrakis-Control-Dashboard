// Pure, deterministic-given-randomness computer opponent for the poker table. No external AI service.
import { HandCategory, type Card, type RandomInt, evaluateHand, secureRandomInt } from './cards';
import type { PokerAction, PokerTable } from './table';

/** Rough 0..1 strength of two hole cards before the flop. */
export function preflopStrength(hole: readonly Card[]): number {
  const [a, b] = hole;
  if (!a || !b) return 0;
  const high = Math.max(a.rank, b.rank);
  const low = Math.min(a.rank, b.rank);
  let score = (high + low - 4) / 24; // 2-2 → 0, A-A before the pair bonus → 1
  if (a.rank === b.rank) score += 0.35;
  if (a.suit === b.suit) score += 0.06;
  if (high - low === 1) score += 0.04;
  return Math.min(1, score);
}

/** Rough 0..1 strength once community cards are out, from the made hand category. */
export function madeHandStrength(hole: readonly Card[], board: readonly Card[]): number {
  if (board.length < 3) return preflopStrength(hole);
  const value = evaluateHand([...hole, ...board]);
  const boardOnly = board.length >= 5 ? evaluateHand(board) : null;
  // Playing the board is no better than anyone else at the table.
  if (boardOnly && boardOnly.category === value.category && boardOnly.score.join() === value.score.join()) return 0.2;
  const base: Record<HandCategory, number> = {
    [HandCategory.HighCard]: 0.12,
    [HandCategory.Pair]: 0.4,
    [HandCategory.TwoPair]: 0.62,
    [HandCategory.ThreeOfAKind]: 0.74,
    [HandCategory.Straight]: 0.82,
    [HandCategory.Flush]: 0.86,
    [HandCategory.FullHouse]: 0.93,
    [HandCategory.FourOfAKind]: 0.98,
    [HandCategory.StraightFlush]: 1,
  };
  // Higher pairs are worth more than low ones.
  const kicker = value.category === HandCategory.Pair ? ((value.score[1] ?? 2) - 2) / 60 : 0;
  return Math.min(1, base[value.category] + kicker);
}

/**
 * Picks an action for the AI seat whose turn it is. Plays straightforwardly with a little noise,
 * so it is beatable and never sees anything a person in its seat could not.
 */
export function chooseBotAction(table: PokerTable, random: RandomInt = secureRandomInt): PokerAction {
  const seat = table.seats[table.turn];
  const legal = seat ? table.legalActions(seat.playerId) : null;
  if (!seat || !legal) return { type: 'fold' };
  // Dev note: the AI reads the cards, not your face. It has no face to read back.
  const noise = (random(21) - 10) / 100;
  const strength = Math.max(0, Math.min(1, madeHandStrength(seat.hole, table.board) + noise));
  const pot = table.seats.reduce((sum, s) => sum + s.handBet, 0);
  const priceOfCall = legal.toCall / Math.max(1, pot + legal.toCall);
  const canRaise = legal.maxRaiseTo > table.currentBet;
  const raiseType = table.currentBet === 0 ? 'bet' : 'raise';

  if (strength > 0.8 && canRaise) {
    const target = Math.min(legal.maxRaiseTo, Math.max(legal.minRaiseTo, table.currentBet + Math.ceil(pot * 0.75)));
    return { type: raiseType, amount: target };
  }
  if (strength > 0.6 && canRaise && legal.toCall === 0 && random(3) === 0) {
    return { type: raiseType, amount: legal.minRaiseTo };
  }
  if (legal.canCheck) return { type: 'check' };
  if (strength >= priceOfCall + 0.15 || (legal.toCall <= table.config.bigBlind && strength > 0.25)) {
    return { type: 'call' };
  }
  return { type: 'fold' };
}

/** Plays one AI turn if an AI is to act; returns whether it acted. */
export function playBotTurn(table: PokerTable, random?: RandomInt): boolean {
  const seat = table.seats[table.turn];
  if (!seat?.isBot || !table.isHandLive()) return false;
  const action = chooseBotAction(table, random);
  try {
    table.act(seat.playerId, action);
  } catch {
    // A rule the heuristic missed must never stall the table.
    table.act(seat.playerId, { type: table.legalActions(seat.playerId)?.canCheck ? 'check' : 'fold' });
  }
  return true;
}
