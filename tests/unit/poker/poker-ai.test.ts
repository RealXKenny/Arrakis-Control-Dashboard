import { describe, expect, it } from 'vitest';
import { parseCard } from '../../../src/features/poker/engine/cards';
import { chooseBotAction, madeHandStrength, playBotTurn, preflopStrength } from '../../../src/features/poker/engine/ai';
import { PokerError, PokerTable } from '../../../src/features/poker/engine/table';

const cards = (labels: string) => labels.split(' ').map(parseCard);

describe('AI players and seat limit', () => {
  it('seats at most four, people and AI together', () => {
    const table = new PokerTable();
    table.join('h1', 'Human');
    table.addBot();
    table.addBot();
    table.addBot();
    expect(table.seats.map((s) => s.playerId)).toEqual(['h1', 'ai-1', 'ai-2', 'ai-3']);
    expect(() => table.addBot()).toThrow('The table is full.');
  });

  it('gives a person the newest AI seat when the table is full', () => {
    const table = new PokerTable();
    table.join('h1', 'One');
    table.addBot();
    table.addBot();
    table.join('h2', 'Two');
    table.join('h3', 'Three');
    expect(table.seats.map((s) => s.playerId)).toEqual(['h1', 'ai-1', 'h2', 'h3']);
    table.join('h4', 'Four');
    expect(table.seats.map((s) => s.playerId)).toEqual(['h1', 'h2', 'h3', 'h4']);
    expect(() => table.join('h5', 'Five')).toThrow(PokerError);
  });

  it('frees an AI seat mid-hand and lets the person play from the next hand', () => {
    const table = new PokerTable();
    table.join('h1', 'One');
    table.addBot();
    table.addBot();
    table.addBot();
    table.startHand();
    table.join('h2', 'Two');
    expect(table.occupiedSeats()).toBe(4);
    while (table.isHandLive()) {
      if (!playBotTurn(table, () => 0))
        table.act('h1', { type: table.legalActions('h1')?.canCheck ? 'check' : 'fold' });
    }
    table.startHand();
    expect(table.seats).toHaveLength(4);
    expect(table.seats.find((s) => s.playerId === 'h2')?.hole).toHaveLength(2);
  });

  it('never deals a table of only AI players', () => {
    const table = new PokerTable();
    table.addBot();
    table.addBot();
    expect(table.canStart()).toBe(false);
    expect(() => table.removeBot('h1')).toThrow(PokerError);
  });
});

describe('AI decisions', () => {
  it('rates strong starting hands above weak ones', () => {
    expect(preflopStrength(cards('As Ah'))).toBeGreaterThan(preflopStrength(cards('Ks Qs')));
    expect(preflopStrength(cards('Ks Qs'))).toBeGreaterThan(preflopStrength(cards('7d 2c')));
    expect(madeHandStrength(cards('As Ah'), cards('Ad Kc 2h'))).toBeGreaterThan(
      madeHandStrength(cards('7d 2c'), cards('Ad Kc 9h')),
    );
  });

  it('treats playing the board as weak', () => {
    expect(madeHandStrength(cards('2c 3d'), cards('As Ks Qs Js Ts'))).toBe(0.2);
  });

  it('only ever chooses legal actions and keeps chips constant over many hands', () => {
    let seed = 7;
    const random = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    for (let game = 0; game < 30; game += 1) {
      const table = new PokerTable({}, random);
      table.join('h1', 'Human');
      table.addBot();
      table.addBot();
      table.addBot();
      for (let hand = 0; hand < 20 && table.canStart(); hand += 1) {
        table.startHand();
        for (let steps = 0; table.isHandLive() && steps < 200; steps += 1) {
          const seat = table.seats[table.turn]!;
          if (seat.isBot) {
            const action = chooseBotAction(table, random);
            expect(() => table.act(seat.playerId, action)).not.toThrow();
          } else {
            table.act('h1', { type: table.legalActions('h1')?.canCheck ? 'check' : 'call' });
          }
        }
        expect(table.isHandLive()).toBe(false);
        expect(table.seats.reduce((sum, s) => sum + s.stack, 0)).toBe(4000);
      }
    }
  });
});
