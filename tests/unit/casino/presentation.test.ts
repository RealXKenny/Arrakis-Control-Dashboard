import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayingCard, CARD_BACKS } from '../../../src/features/casino/components/playing-card';
import { EUROPEAN_WHEEL } from '../../../src/features/casino/components/roulette-wheel';
import { narrateRound } from '../../../src/features/casino/components/narration';
import type { RoundView } from '../../../src/features/casino/contracts';

const round = (patch: Partial<RoundView> = {}): RoundView => ({
  id: 'round-1',
  game: 'emperors-hand',
  status: 'open',
  wager: '100',
  holds: 1,
  version: 2,
  fairness: null,
  game_view: {
    hands: [{ cards: [0, 5], total: 17, soft: true }],
    dealer: [9],
    dealerHidden: true,
    dealerTotal: null,
    active: 0,
  },
  settlement: null,
  failureCode: null,
  ...patch,
});

describe('original playing deck', () => {
  it('renders all 52 faces with unique accessible identities and correct numeric pip counts', () => {
    const faces = Array.from({ length: 52 }, (_, id) => renderToStaticMarkup(createElement(PlayingCard, { id })));
    expect(new Set(faces.map((face) => face.match(/aria-label="([^"]+)"/)![1])).size).toBe(52);
    for (let id = 0; id < 52; id++) {
      const rank = (id % 13) + 1;
      if (rank >= 2 && rank <= 10) expect((faces[id].match(/data-pip="true"/g) ?? []).length).toBe(rank);
    }
    expect(new Set(faces.filter((_, id) => id % 13 >= 10)).size).toBe(12);
  });
  it('offers distinct backs and never renders a concealed face', () => {
    const backs = CARD_BACKS.map((back) =>
      renderToStaticMarkup(createElement(PlayingCard, { id: 12, faceUp: false, back })),
    );
    expect(new Set(backs).size).toBe(3);
    for (const back of backs) {
      expect(back).toContain('Face-down card');
      expect(back).not.toContain('King');
    }
  });
  it('uses the complete European single-zero pocket sequence', () => {
    expect(EUROPEAN_WHEEL).toHaveLength(37);
    expect(new Set(EUROPEAN_WHEEL).size).toBe(37);
    expect(EUROPEAN_WHEEL.slice(0, 9)).toEqual([0, 32, 15, 19, 4, 21, 2, 25, 17]);
    expect(EUROPEAN_WHEEL[36]).toBe(26);
  });
});

describe('confirmed narration', () => {
  it('announces actual visible ranks and soft totals without the hole card or a payout', () => {
    const event = narrateRound(round(), null)!;
    expect(event.text).toContain('ace and six. Soft 17');
    expect(event.text).toContain('Dealer shows a ten');
    expect(event.text).not.toMatch(/wins|payout|settled/);
    expect(narrateRound(round(), round())).toBeNull();
    expect(narrateRound(round({ version: 1 }), round())).toBeNull();
  });
  it('names split hands and accepted actions, and only announces settled outcomes', () => {
    const event = narrateRound(
      round({
        game_view: {
          hands: [
            { cards: [7, 9], total: 18, soft: false },
            { cards: [20, 6], total: 15, soft: false },
          ],
          dealer: [9],
          dealerHidden: true,
          dealerTotal: null,
        },
      }),
      null,
      { type: 'split' },
    )!;
    expect(event.text).toContain('Splitting the pair');
    expect(event.text).toContain('Hand 1 eight and ten. 18');
    expect(event.text).toContain('Hand 2 eight and seven. 15');
    expect(narrateRound(round({ status: 'settling' }), null)).toBeNull();
    const settled = narrateRound(
      round({ status: 'settled', settlement: { payout: '100', result: { hands: [{ outcome: 'push' }] } } }),
      null,
    )!;
    expect(settled.text).toContain('Push. Your wager is returned');
    expect(settled.priority).toBe(4);
  });
  it.each([
    ['spice-wheel', { number: 0 }, '0, green'],
    ['spice-wheel', { number: 17 }, '17, black'],
    ['fate-of-arrakis', { rollDisplay: '42.60', win: true }, '42.60. You win'],
    ['great-houses', { landed: 'crescent', won: false }, 'House Crescent prevails'],
    ['spice-harvest', { outcome: 'hazard' }, 'Sandworm detected'],
    ['ornithopter-run', { outcome: 'crashed' }, 'Storm contact'],
    ['ornithopter-run', { outcome: 'cashed_out', cashedOutBps: 25000 }, '2.50 times'],
  ])('%s speaks only its confirmed result', (game, result, expected) => {
    expect(
      narrateRound(
        round({
          game: String(game),
          status: 'settled',
          settlement: { payout: '0', result: result as Record<string, unknown> },
        }),
        null,
      )?.text,
    ).toContain(expected);
  });
  it('does not chatter over Crash polling updates', () => {
    expect(narrateRound(round({ game: 'ornithopter-run', version: 3 }), round({ game: 'ornithopter-run' }))).toBeNull();
  });
});
