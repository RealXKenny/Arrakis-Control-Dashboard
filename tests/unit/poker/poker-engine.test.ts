import { describe, expect, it } from 'vitest';
import {
  type Card,
  HandCategory,
  compareHands,
  evaluateHand,
  newDeck,
  parseCard,
  secureRandomInt,
  shuffle,
} from '../../../src/features/poker/engine/cards';
import { PokerError, PokerTable } from '../../../src/features/poker/engine/table';

const cards = (labels: string): Card[] => labels.split(' ').map(parseCard);
const value = (labels: string) => evaluateHand(cards(labels));

describe('deck', () => {
  it('has 52 unique cards and shuffles without losing any', () => {
    const shuffled = shuffle(newDeck());
    expect(new Set(shuffled.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });
});

describe('hand ranking', () => {
  it.each([
    ['As Ks Qs Js Ts 2d 3c', HandCategory.StraightFlush],
    ['9h 9d 9s 9c 2d 3c 4h', HandCategory.FourOfAKind],
    ['9h 9d 9s 2c 2d 3c 4h', HandCategory.FullHouse],
    ['2h 7h 9h Jh Kh 3c 4d', HandCategory.Flush],
    ['Ah 2d 3s 4c 5h 9c Kd', HandCategory.Straight],
    ['9h 9d 9s 2c 5d 3c Kh', HandCategory.ThreeOfAKind],
    ['9h 9d 2s 2c 5d 3c Kh', HandCategory.TwoPair],
    ['9h 9d 2s 7c 5d 3c Kh', HandCategory.Pair],
    ['9h Jd 2s 7c 5d 3c Kh', HandCategory.HighCard],
  ])('%s is category %i', (hand, category) => {
    expect(value(hand).category).toBe(category);
  });

  it('ranks the wheel below a six-high straight', () => {
    expect(compareHands(value('Ah 2d 3s 4c 5h'), value('2d 3s 4c 5h 6d'))).toBeLessThan(0);
  });

  it('uses kickers and picks the best two pair out of three', () => {
    expect(compareHands(value('Ah Ad Kc 7s 2d'), value('As Ac Qc 7d 2h'))).toBeGreaterThan(0);
    expect(value('Ah Ad Kc Ks 2d 2h Qc').score).toEqual([HandCategory.TwoPair, 14, 13, 12]);
  });

  it('treats identical boards as a tie', () => {
    expect(compareHands(value('As Ks Qs Js Ts'), value('As Ks Qs Js Ts'))).toBe(0);
  });

  it('prefers a straight flush over a higher plain flush in the same suit', () => {
    expect(value('2h 3h 4h 5h 6h Kh Ah').category).toBe(HandCategory.StraightFlush);
  });
});

describe('table rules', () => {
  it('rejects bad config and duplicate seats', () => {
    expect(() => new PokerTable({ smallBlind: 20, bigBlind: 10 })).toThrow(PokerError);
    const table = new PokerTable();
    table.join('a', 'A');
    expect(() => table.join('a', 'A')).toThrow(PokerError);
  });

  it('needs two players to deal', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    expect(table.canStart()).toBe(false);
    expect(() => table.startHand()).toThrow(PokerError);
  });

  it('posts blinds heads-up with the button on the small blind acting first', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    const [a, b] = table.seats;
    expect(table.button).toBe(0);
    expect(a?.streetBet).toBe(5);
    expect(b?.streetBet).toBe(10);
    expect(table.turn).toBe(0);
    expect(a?.hole).toHaveLength(2);
  });

  it('gives the big blind the option and moves through every street', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    table.act('a', { type: 'call' });
    expect(table.street).toBe('preflop');
    expect(table.seats[table.turn]?.playerId).toBe('b');
    table.act('b', { type: 'check' });
    expect(table.street).toBe('flop');
    expect(table.board).toHaveLength(3);
    // Postflop heads-up the big blind acts first.
    expect(table.seats[table.turn]?.playerId).toBe('b');
    table.act('b', { type: 'check' });
    table.act('a', { type: 'check' });
    expect(table.street).toBe('turn');
    table.act('b', { type: 'check' });
    table.act('a', { type: 'check' });
    table.act('b', { type: 'check' });
    table.act('a', { type: 'check' });
    expect(table.street).toBe('showdown');
    expect(table.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(2000);
  });

  it('refuses out-of-turn, illegal checks and undersized raises', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    expect(() => table.act('b', { type: 'check' })).toThrow('not your turn');
    expect(() => table.act('a', { type: 'check' })).toThrow(PokerError);
    expect(() => table.act('a', { type: 'raise', amount: 15 })).toThrow('minimum is 20');
    expect(() => table.act('a', { type: 'raise', amount: 1.5 })).toThrow(PokerError);
    expect(() => table.act('a', { type: 'raise', amount: 5000 })).toThrow(PokerError);
  });

  it('awards the pot when everyone else folds', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.join('c', 'C');
    table.startHand();
    // Button a, SB b, BB c; a acts first.
    table.act('a', { type: 'raise', amount: 30 });
    table.act('b', { type: 'fold' });
    table.act('c', { type: 'fold' });
    expect(table.street).toBe('showdown');
    expect(table.seats.find((s) => s.playerId === 'a')?.stack).toBe(1015);
    expect(table.lastResult?.pots[0]?.winners).toEqual(['a']);
  });

  it('runs the board out when everyone is all in and keeps chips constant', () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const table = new PokerTable();
      table.join('a', 'A');
      table.join('b', 'B');
      table.join('c', 'C');
      table.seats[0]!.stack = 100;
      table.seats[1]!.stack = 300;
      table.startHand();
      table.act('a', { type: 'all-in' });
      table.act('b', { type: 'all-in' });
      table.act('c', { type: 'call' });
      expect(table.street).toBe('showdown');
      expect(table.board).toHaveLength(5);
      expect(table.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(1400);
      // The short stack can never win more than three times its stack.
      expect(table.seats[0]!.stack).toBeLessThanOrEqual(300);
    }
  });

  it('only reveals hole cards to their owner before showdown', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    const view = table.viewFor('a');
    expect(view.seats[0]?.hole.every((c) => c !== null)).toBe(true);
    expect(view.seats[1]?.hole.every((c) => c === null)).toBe(true);
    expect(table.viewFor(null).seats.every((s) => s.hole.every((c) => c === null))).toBe(true);
    expect(view.legal?.toCall).toBe(5);
  });

  it('folds a player who leaves mid-hand and removes them afterwards', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.join('c', 'C');
    table.startHand();
    table.leave('b');
    expect(table.seats.find((s) => s.playerId === 'b')?.folded).toBe(true);
    table.act('a', { type: 'fold' });
    expect(table.street).toBe('showdown');
    expect(table.seats.map((s) => s.playerId)).toEqual(['a', 'c']);
    expect(table.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(2005);
  });

  it('seats mid-hand joiners for the next deal only', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    table.join('c', 'C');
    expect(table.seats[2]?.hole).toHaveLength(0);
    table.act('a', { type: 'fold' });
    expect(table.seats).toHaveLength(3);
    table.startHand();
    expect(table.seats[2]?.hole).toHaveLength(2);
  });
});

describe('shot clock and snapshots', () => {
  it('checks for an absent player when free and folds when facing a bet', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    // a (small blind) faces the big blind, so the clock folds.
    expect(table.timeoutTurn()).toBe('a');
    expect(table.street).toBe('showdown');
    expect(table.seats.find((s) => s.playerId === 'a')?.missedTurns).toBe(1);
  });

  it('removes a player after repeated timeouts without stalling the table', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    table.timeoutTurn(); // a is the small blind facing a bet: fold, first miss
    table.startHand();
    table.act('b', { type: 'call' }); // b is now the button and small blind
    expect(table.seats[table.turn]?.playerId).toBe('a');
    table.timeoutTurn(); // second miss: a is treated as gone and folded out
    expect(table.street).toBe('showdown');
    expect(table.seats.map((s) => s.playerId)).toEqual(['b']);
    expect(table.seats[0]?.stack).toBe(1015);
  });

  it('round-trips a live hand through a snapshot without changing the outcome', () => {
    const table = new PokerTable();
    table.join('a', 'A');
    table.join('b', 'B');
    table.startHand();
    table.act('a', { type: 'call' });
    const copy = PokerTable.fromSnapshot(JSON.parse(JSON.stringify(table.toSnapshot())));
    expect(copy.viewFor('a')).toEqual(table.viewFor('a'));
    copy.act('b', { type: 'check' });
    table.act('b', { type: 'check' });
    expect(copy.board).toEqual(table.board);
  });

  it('lets a leaving player change their mind before the hand ends', () => {
    const table = new PokerTable();
    for (const id of ['a', 'b', 'c']) table.join(id, id.toUpperCase());
    table.startHand();
    table.leave('c');
    table.join('c', 'C');
    table.act('a', { type: 'fold' });
    expect(table.seats.map((s) => s.playerId)).toContain('c');
  });
});

describe('secure random', () => {
  it('stays in range', () => {
    for (let i = 0; i < 500; i += 1) {
      const value = secureRandomInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
    }
    expect(() => secureRandomInt(0)).toThrow(RangeError);
  });
});
