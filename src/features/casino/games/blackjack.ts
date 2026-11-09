import { engineError, type GameModule, type Settlement } from '../engine/types';

/**
 * The Emperor's Hand: Blackjack.
 *
 * Rules (disclosed to players):
 *  - 6 decks, freshly shuffled for every round (Fisher-Yates from the committed seed). No card counting is possible.
 *  - Deal order: player, dealer (up card), player, dealer (hole card). The dealer peeks for blackjack
 *    when showing an ace or a ten-value card; a dealer blackjack ends the round at once.
 *  - Dealer stands on ALL 17s (including soft 17) and draws on 16 or less.
 *  - Blackjack (a two-card 21 that is not from a split) pays 3:2, rounded down to a whole unit; both
 *    blackjack is a push. A 21 reached any other way pays 1:1.
 *  - Double down: any first two cards of a hand, including after a split (not split aces). One card, then the hand stands.
 *  - Split: two cards of the same rank, once per round (no re-split), at most two hands. Split aces receive
 *    one card each and stand. 21 after a split is not a blackjack.
 *  - No insurance, no surrender.
 *
 * Card id (0-311): rank = id % 13 (0 = ace, 1-9 = two to ten, 10-12 = jack, queen, king); suit = floor(id / 13) % 4.
 * Only the first 60 cards of the shuffled shoe are kept; no round can use more.
 */

const DECKS = 6;
const KEPT_CARDS = 60;
export const BLACKJACK_RULES = {
  decks: DECKS,
  dealerStandsOn: 'all 17',
  blackjackPays: '3:2',
  doubleOn: 'any first two cards, also after split (not split aces)',
  split: 'same rank, once, no re-split, split aces one card each',
  insurance: false,
  surrender: false,
  shuffle: 'fresh 6-deck shoe every round',
} as const;

type Hand = { cards: number[]; doubled: boolean; done: boolean; fromSplit: boolean; splitAces: boolean };
export type BlackjackState = {
  shoe: number[];
  pos: number;
  dealer: number[];
  hands: Hand[];
  active: number;
  wager: string;
  /** True once the round has ended (dealer played or natural resolved). */
  over: boolean;
};
export type BlackjackAction = { type: 'hit' | 'stand' | 'double' | 'split' | 'abandon' };

const rank = (card: number) => card % 13;
const cardPoints = (card: number) => Math.min(rank(card) + 1, 10);

export function handValue(cards: readonly number[]): { total: number; soft: boolean } {
  let total = cards.reduce((sum, card) => sum + cardPoints(card), 0);
  const hasAce = cards.some((card) => rank(card) === 0);
  if (hasAce && total + 10 <= 21) return { total: total + 10, soft: true };
  return { total, soft: false };
}

const isNatural = (hand: Hand) => !hand.fromSplit && hand.cards.length === 2 && handValue(hand.cards).total === 21;
const dealerNatural = (cards: readonly number[]) => cards.length === 2 && handValue(cards).total === 21;

function draw(state: BlackjackState): number {
  const card = state.shoe[state.pos];
  if (card === undefined) throw engineError('SHOE_EXHAUSTED', 'Shoe exhausted');
  state.pos += 1;
  return card;
}

function betOf(state: BlackjackState, hand: Hand): bigint {
  return BigInt(state.wager) * (hand.doubled ? 2n : 1n);
}

function resolve(state: BlackjackState): Settlement {
  // The dealer only plays when some hand can still win.
  const live = state.hands.some(
    (hand) => handValue(hand.cards).total <= 21 && !(isNatural(hand) && !dealerNatural(state.dealer)),
  );
  const anyContest = live && !state.hands.every((hand) => isNatural(hand));
  if (anyContest) while (handValue(state.dealer).total < 17) state.dealer.push(draw(state));
  const dealerTotal = handValue(state.dealer).total;
  const dealerBj = dealerNatural(state.dealer);
  let payout = 0n;
  const hands = state.hands.map((hand) => {
    const total = handValue(hand.cards).total;
    const bet = betOf(state, hand);
    let outcome: 'bust' | 'blackjack' | 'win' | 'push' | 'lose';
    let paid = 0n;
    if (total > 21) outcome = 'bust';
    else if (isNatural(hand)) {
      if (dealerBj) [outcome, paid] = ['push', bet];
      else [outcome, paid] = ['blackjack', (bet * 5n) / 2n];
    } else if (dealerBj) outcome = 'lose';
    else if (dealerTotal > 21 || total > dealerTotal) [outcome, paid] = ['win', bet * 2n];
    else if (total === dealerTotal) [outcome, paid] = ['push', bet];
    else outcome = 'lose';
    payout += paid;
    return { cards: hand.cards, total, bet: bet.toString(), outcome, payout: paid.toString() };
  });
  state.over = true;
  return { payout, result: { dealer: state.dealer, dealerTotal, hands } };
}

function nextHand(state: BlackjackState): Settlement | undefined {
  const index = state.hands.findIndex((hand) => !hand.done);
  if (index === -1) return resolve(state);
  state.active = index;
  return undefined;
}

/** Build a round from an already ordered shoe. `start` shuffles; tests inject fixed shoes. */
export function blackjackFromShoe(shoe: number[], wager: bigint): { state: BlackjackState; settlement?: Settlement } {
  const state: BlackjackState = {
    shoe,
    pos: 0,
    dealer: [],
    hands: [{ cards: [], doubled: false, done: false, fromSplit: false, splitAces: false }],
    active: 0,
    wager: wager.toString(),
    over: false,
  };
  const player = state.hands[0]!;
  player.cards.push(draw(state));
  state.dealer.push(draw(state));
  player.cards.push(draw(state));
  state.dealer.push(draw(state));
  if (isNatural(player) || dealerNatural(state.dealer)) {
    player.done = true;
    return { state, settlement: resolve(state) };
  }
  return { state };
}

export function legalActions(state: BlackjackState): Array<Exclude<BlackjackAction['type'], 'abandon'>> {
  if (state.over) return [];
  const hand = state.hands[state.active];
  if (!hand || hand.done) return [];
  const actions: Array<Exclude<BlackjackAction['type'], 'abandon'>> = ['stand'];
  if (!hand.splitAces) actions.push('hit');
  if (hand.cards.length === 2 && !hand.splitAces) actions.push('double');
  if (state.hands.length === 1 && hand.cards.length === 2 && rank(hand.cards[0]!) === rank(hand.cards[1]!))
    actions.push('split');
  return actions;
}

export const blackjack: GameModule<BlackjackState, BlackjackAction> = {
  id: 'emperors-hand',
  minWager: 10n,
  maxWager: 50_000n,
  parseParams: () => ({}),
  parseAction(raw) {
    const type = (raw as { type?: unknown } | null)?.type;
    if (type !== 'hit' && type !== 'stand' && type !== 'double' && type !== 'split' && type !== 'abandon')
      throw engineError('INVALID_ACTION', 'Unknown action');
    return { type };
  },
  start(rng, wager) {
    const deck = Array.from({ length: DECKS * 52 }, (_, index) => index);
    return blackjackFromShoe(rng.shuffle(deck).slice(0, KEPT_CARDS), wager);
  },
  abandon: (state) => (state.over ? undefined : { type: 'abandon' }),
  act(previous, action) {
    if (action.type === 'abandon') {
      // Standing every remaining hand: what a player who walks away is treated as having chosen.
      if (previous.over) throw engineError('ILLEGAL_ACTION', 'The round is over');
      const abandoned = structuredClone(previous);
      for (const hand of abandoned.hands) hand.done = true;
      return { state: abandoned, settlement: nextHand(abandoned) };
    }
    if (!legalActions(previous).includes(action.type))
      throw engineError('ILLEGAL_ACTION', 'That action is not available');
    const state = structuredClone(previous);
    const hand = state.hands[state.active]!;
    let additionalWager: bigint | undefined;

    if (action.type === 'hit') {
      hand.cards.push(draw(state));
      const total = handValue(hand.cards).total;
      if (total >= 21) hand.done = true;
    } else if (action.type === 'stand') {
      hand.done = true;
    } else if (action.type === 'double') {
      hand.doubled = true;
      hand.cards.push(draw(state));
      hand.done = true;
      additionalWager = BigInt(state.wager);
    } else {
      const [first, second] = hand.cards as [number, number];
      const aces = rank(first) === 0;
      const make = (card: number): Hand => ({
        cards: [card],
        doubled: false,
        done: false,
        fromSplit: true,
        splitAces: aces,
      });
      const left = make(first);
      const right = make(second);
      left.cards.push(draw(state));
      right.cards.push(draw(state));
      for (const part of [left, right]) if (aces || handValue(part.cards).total === 21) part.done = true;
      state.hands = [left, right];
      state.active = 0;
      additionalWager = BigInt(state.wager);
    }

    const settlement = nextHand(state);
    return { state, settlement, additionalWager };
  },
  view(state, finished) {
    return {
      // The shoe and the dealer's hole card are never exposed while the round is open.
      hands: state.hands.map((hand) => ({
        cards: hand.cards,
        ...handValue(hand.cards),
        doubled: hand.doubled,
        done: hand.done,
      })),
      active: finished ? null : state.active,
      dealer: finished ? state.dealer : [state.dealer[0]],
      dealerHidden: !finished,
      dealerTotal: finished ? handValue(state.dealer).total : null,
      actions: finished ? [] : legalActions(state),
    };
  },
};
