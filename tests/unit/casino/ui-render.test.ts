import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => createElement('a', { href }, children as never),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/casino',
  useSearchParams: () => new URLSearchParams(),
}));

import { FairnessPanel } from '../../../src/features/casino/components/fairness-panel';
import { GameTable } from '../../../src/features/casino/components/game-table';
import { PlayingCard } from '../../../src/features/casino/components/parts';
import { ReconciliationPanel } from '../../../src/features/casino/components/reconciliation-panel';
import { TransferPanel } from '../../../src/features/casino/components/transfer-panel';
import { WalletControls } from '../../../src/features/casino/components/wallet-controls';
import { GAMES, STAKES_NOTICE, type WalletSnapshot } from '../../../src/features/casino/contracts';

const wallet = (patch: Partial<WalletSnapshot> = {}): WalletSnapshot => ({
  solaris: { available: '10000', reserved: '0' },
  pausedUntil: null,
  enabled: true,
  limits: { maxWager: '5000', maxPayout: '1000000' },
  ...patch,
});

const START_BUTTON: Record<string, string> = {
  'emperors-hand': 'Deal',
  'spice-wheel': 'Spin',
  'fate-of-arrakis': 'Roll',
  'spice-harvest': 'Begin expedition',
  'ornithopter-run': 'Launch',
  'great-houses': 'Flip the coin',
};

describe('game tables render server-side', () => {
  for (const game of GAMES) {
    it(`${game.name}: shows the real-stakes notice, balance, rules, the server wager limit and a start control`, () => {
      const html = renderToStaticMarkup(createElement(GameTable, { game, initialWallet: wallet() }));
      expect(html).toContain(game.name.replace(/'/g, '&#x27;'));
      expect(html).toContain(STAKES_NOTICE);
      expect(html).not.toMatch(/demo/i);
      // Roulette's wager is the sum of its bets, so it has no single wager field.
      if (game.id !== 'spice-wheel') expect(html).toMatch(/Table limits: [\d,]+ to (5,000|1,000)/);
      expect(html).toContain('10,000');
      expect(html).toContain('Rules and odds');
      expect(html).toContain(START_BUTTON[game.id]!);
      expect(html).toContain('Remind me to take a break');
    });

    it(`${game.name}: a paused member cannot start a round`, () => {
      const html = renderToStaticMarkup(
        createElement(GameTable, { game, initialWallet: wallet({ pausedUntil: Date.now() + 3_600_000 }) }),
      );
      expect(html).toContain('You paused play until');
      const start = html.match(new RegExp(`<button[^>]*>${START_BUTTON[game.id]}</button>`))?.[0];
      // The roulette spin is also disabled while no bets are placed; every start control is disabled when paused.
      expect(start).toMatch(/disabled/);
    });
  }

  it('the roulette table is a keyboard-operable grid of labelled buttons with an accessible total', () => {
    const roulette = GAMES.find((game) => game.id === 'spice-wheel')!;
    const html = renderToStaticMarkup(createElement(GameTable, { game: roulette, initialWallet: wallet() }));
    expect(html).toContain('aria-label="Number 18, red"');
    expect(html).toContain('aria-label="Number 17, black"');
    expect(html).toContain('aria-label="Number 0, green"');
    expect(html).toContain('aria-label="Red"');
    expect(html).toContain('Total: 0');
    expect((html.match(/aria-label="Number \d+, /g) ?? []).length).toBe(37);
  });

  it('the dice table states chance, multiplier and payout before rolling', () => {
    const dice = GAMES.find((game) => game.id === 'fate-of-arrakis')!;
    const html = renderToStaticMarkup(createElement(GameTable, { game: dice, initialWallet: wallet() }));
    expect(html).toContain('50.00%');
    expect(html).toContain('1.9800x');
    expect(html).toContain('Landing exactly on the target loses');
  });
});

describe('cards', () => {
  it('describe themselves for screen readers and hide face-down cards', () => {
    expect(renderToStaticMarkup(createElement(PlayingCard, { id: 0 }))).toContain('Ace of spades');
    expect(renderToStaticMarkup(createElement(PlayingCard, { id: 13 }))).toContain('Ace of hearts');
    expect(renderToStaticMarkup(createElement(PlayingCard, { id: 12 + 26 }))).toContain('King of diamonds');
    const back = renderToStaticMarkup(createElement(PlayingCard, { id: null }));
    expect(back).toContain('Face-down card');
    expect(back).not.toMatch(/Ace|King/);
  });
});

describe('wallet and fairness panels', () => {
  it('explains voluntary breaks and shows an active one', () => {
    const html = renderToStaticMarkup(createElement(WalletControls, { pausedUntil: null }));
    expect(html).toContain('Take a break');
    expect(html).toContain('1 hour');
    expect(html).toContain('30 days');
    expect(html).toContain('You can still withdraw your Solaris');
    expect(html).not.toMatch(/refill|demo/i);
    expect(renderToStaticMarkup(createElement(WalletControls, { pausedUntil: Date.now() + 3_600_000 }))).toContain(
      'Paused until',
    );
  });

  it('shows a closed notice and no tables while the server switch is off', () => {
    const game = GAMES[0]!;
    const html = renderToStaticMarkup(createElement(GameTable, { game, initialWallet: wallet({ enabled: false }) }));
    expect(html).toContain('The Solaris Exchange is closed');
    expect(html).not.toContain('Deal');
  });

  it('the transfer panel needs a confirmed amount, is disabled while closed, and explains uncertain transfers plainly', () => {
    const rows = [
      {
        id: 'dep_a',
        kind: 'deposit' as const,
        amount: '5000',
        state: 'needs_reconciliation' as const,
        failureCode: 'OUTCOME_UNKNOWN',
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'wd_b',
        kind: 'withdrawal' as const,
        amount: '300',
        state: 'completed' as const,
        failureCode: null,
        createdAt: 3,
        updatedAt: 4,
      },
    ];
    const open = renderToStaticMarkup(
      createElement(TransferPanel, { enabled: true, available: '1200', initial: rows }),
    );
    expect(open).toContain('Deposit to casino');
    expect(open).toContain('Withdraw to game');
    expect(open).toContain('Amounts are final once confirmed');
    expect(open).toContain('Log out of the game first');
    expect(open).not.toContain('alertdialog');
    expect(open).toContain('could not confirm whether the game took the Solaris');
    expect(open).toContain('Nothing more will be sent automatically');
    expect(open).toContain('The Solaris will be in your game account the next time you join');
    const closed = renderToStaticMarkup(createElement(TransferPanel, { enabled: false, available: '0', initial: [] }));
    expect(closed).toContain('switched off on this server');
    expect(closed).toMatch(/<button[^>]*disabled=""[^>]*>Review<\/button>/);
  });

  it('the reconciliation screen shows the facts an administrator needs and nothing else to guess with', () => {
    const html = renderToStaticMarkup(
      createElement(ReconciliationPanel, {
        initial: [
          {
            id: 'dep_a',
            kind: 'deposit',
            amount: '5000',
            state: 'needs_reconciliation',
            failureCode: 'OUTCOME_UNKNOWN',
            createdAt: 1,
            updatedAt: 2,
            owner: '123',
            playerId: '4242',
            gameBalance: '10000',
          },
        ],
      }),
    );
    expect(html).toContain('Deposit of 5,000 Solaris');
    expect(html).toContain('4242');
    expect(html).toContain('Mark applied');
    expect(html).toContain('Mark not applied');
    expect(renderToStaticMarkup(createElement(ReconciliationPanel, { initial: [] }))).toContain('Nothing is waiting');
  });

  it('shows only the commitment of the active seed and the full retired seeds', () => {
    const html = renderToStaticMarkup(
      createElement(FairnessPanel, {
        initialRound: 'r_abc',
        initial: {
          commitment: 'c'.repeat(64),
          clientSeed: 'my-seed',
          nonce: 3,
          revealed: [{ commitment: 'd'.repeat(64), serverSeed: 'e'.repeat(64), rounds: 5 }],
        },
      }),
    );
    expect(html).toContain('c'.repeat(64));
    expect(html).toContain('e'.repeat(64));
    expect(html).toContain('value="r_abc"');
    expect(html).toContain('Rotate seed and reveal the old one');
  });
});
