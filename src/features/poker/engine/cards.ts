// Pure, browser-safe Texas Hold'em engine: cards, deck and hand ranking. Play money only.

export const SUITS = ['c', 'd', 'h', 's'] as const;
export type Suit = (typeof SUITS)[number];
export type Rank = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

export type RandomInt = (maxExclusive: number) => number;

const RANK_LABELS: Record<Rank, string> = {
  2: '2',
  3: '3',
  4: '4',
  5: '5',
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: 'T',
  11: 'J',
  12: 'Q',
  13: 'K',
  14: 'A',
};

export function parseCard(label: string): Card {
  const match = /^([2-9TJQKA])([cdhs])$/.exec(label);
  if (!match) throw new Error(`Invalid card label: ${label}`);
  const rankEntry = Object.entries(RANK_LABELS).find(([, value]) => value === match[1]);
  if (!rankEntry) throw new Error(`Invalid card rank: ${label}`);
  return { rank: Number(rankEntry[0]) as Rank, suit: match[2] as Suit };
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank += 1) deck.push({ rank: rank as Rank, suit });
  }
  return deck;
}

/** Unbiased integer in [0, maxExclusive) from Web Crypto, by rejection sampling. */
export function secureRandomInt(maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 0x1_0000_0000) {
    throw new RangeError('maxExclusive must be an integer from 1 to 2^32.');
  }
  const limit = 0x1_0000_0000 - (0x1_0000_0000 % maxExclusive);
  const buffer = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buffer);
    const value = buffer[0] as number;
    // Dev note: we reshuffle the long tail, because even the Guild Bank hates a biased deck.
    if (value < limit) return value % maxExclusive;
  }
}

/** Fisher-Yates shuffle with a cryptographic source by default. */
export function shuffle(deck: Card[], random: RandomInt = secureRandomInt): Card[] {
  const copy = [...deck];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    const held = copy[i] as Card;
    copy[i] = copy[j] as Card;
    copy[j] = held;
  }
  return copy;
}

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  ThreeOfAKind = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  FourOfAKind = 7,
  StraightFlush = 8,
}

export const HAND_NAMES: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two pair',
  [HandCategory.ThreeOfAKind]: 'Three of a kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.FourOfAKind]: 'Four of a kind',
  [HandCategory.StraightFlush]: 'Straight flush',
};

export interface HandValue {
  readonly category: HandCategory;
  /** Category first, then tiebreak ranks; compare lexicographically. */
  readonly score: readonly number[];
}

/** Highest straight top card in a descending unique rank list, or 0. Handles the wheel. */
function straightHigh(ranks: readonly number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let high = 14; high >= 5; high -= 1) {
    let run = true;
    for (let r = high; r > high - 5; r -= 1) {
      if (!set.has(r)) {
        run = false;
        break;
      }
    }
    if (run) return high;
  }
  return 0;
}

/** Evaluates the best five-card hand from five to seven cards. */
export function evaluateHand(cards: readonly Card[]): HandValue {
  if (cards.length < 5 || cards.length > 7) throw new Error('evaluateHand needs 5 to 7 cards');

  const bySuit = new Map<Suit, number[]>();
  for (const card of cards) {
    const list = bySuit.get(card.suit) ?? [];
    list.push(card.rank);
    bySuit.set(card.suit, list);
  }
  for (const list of bySuit.values()) {
    if (list.length < 5) continue;
    const sorted = [...list].sort((a, b) => b - a);
    const sfHigh = straightHigh(sorted);
    if (sfHigh) return { category: HandCategory.StraightFlush, score: [HandCategory.StraightFlush, sfHigh] };
  }

  const counts = new Map<number, number>();
  for (const card of cards) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  // Group ranks by count desc, then rank desc.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const ranksDesc = [...counts.keys()].sort((a, b) => b - a);
  const kickers = (exclude: readonly number[], n: number): number[] =>
    ranksDesc.filter((r) => !exclude.includes(r)).slice(0, n);

  const [first, second] = groups;
  if (first && first[1] === 4) {
    return {
      category: HandCategory.FourOfAKind,
      score: [HandCategory.FourOfAKind, first[0], ...kickers([first[0]], 1)],
    };
  }
  if (first && first[1] === 3 && second && second[1] >= 2) {
    return { category: HandCategory.FullHouse, score: [HandCategory.FullHouse, first[0], second[0]] };
  }
  for (const list of bySuit.values()) {
    if (list.length < 5) continue;
    const top = [...list].sort((a, b) => b - a).slice(0, 5);
    return { category: HandCategory.Flush, score: [HandCategory.Flush, ...top] };
  }
  const high = straightHigh(ranksDesc);
  if (high) return { category: HandCategory.Straight, score: [HandCategory.Straight, high] };
  if (first && first[1] === 3) {
    return {
      category: HandCategory.ThreeOfAKind,
      score: [HandCategory.ThreeOfAKind, first[0], ...kickers([first[0]], 2)],
    };
  }
  if (first && second && first[1] === 2 && second[1] === 2) {
    return {
      category: HandCategory.TwoPair,
      score: [HandCategory.TwoPair, first[0], second[0], ...kickers([first[0], second[0]], 1)],
    };
  }
  if (first && first[1] === 2) {
    return { category: HandCategory.Pair, score: [HandCategory.Pair, first[0], ...kickers([first[0]], 3)] };
  }
  return { category: HandCategory.HighCard, score: [HandCategory.HighCard, ...ranksDesc.slice(0, 5)] };
}

export function compareHands(a: HandValue, b: HandValue): number {
  const length = Math.max(a.score.length, b.score.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (a.score[i] ?? 0) - (b.score[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
