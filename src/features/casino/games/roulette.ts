import { engineError, type GameModule } from '../engine/types';

/**
 * The Spice Wheel: European (single-zero) Roulette, 37 pockets numbered 0 to 36.
 *
 * The winning pocket is `rng.int(37)` from the committed seed, so every pocket has probability exactly 1/37.
 * Several bets may be placed on one spin; the round's wager is the sum of the bet amounts.
 *
 *  bet            wins on                          pays (stake returned plus winnings)
 *  straight       the single number                35:1  (36x)
 *  color          red or black                      1:1   (2x)
 *  parity         odd or even (zero is neither)     1:1   (2x)
 *  range          low 1-18 or high 19-36            1:1   (2x)
 *  dozen          1-12, 13-24 or 25-36              2:1   (3x)
 *  column         n % 3 = 1, 2 or 0 (1 to 36)       2:1   (3x)
 *
 * Zero loses every outside bet (no en prison / la partage). Every bet type returns 36/37 (about 97.30%),
 * a house edge of 1/37 (about 2.70%). All payouts are whole multiples of the stake, so nothing is rounded.
 */

export const RED_NUMBERS: ReadonlySet<number> = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
export const MAX_BETS = 20;

export type RouletteBet = { amount: bigint } & (
  | { type: 'straight'; number: number }
  | { type: 'color'; value: 'red' | 'black' }
  | { type: 'parity'; value: 'odd' | 'even' }
  | { type: 'range'; value: 'low' | 'high' }
  | { type: 'dozen'; value: 1 | 2 | 3 }
  | { type: 'column'; value: 1 | 2 | 3 }
);
type StoredBet = Omit<RouletteBet, 'amount'> & { amount: string };

export const pocketColor = (n: number): 'green' | 'red' | 'black' =>
  n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';

/** Total return (stake plus winnings) of one bet for a winning number, 0 if it loses. */
export function betReturn(bet: RouletteBet, n: number): bigint {
  let wins = false;
  let multiple = 2n;
  switch (bet.type) {
    case 'straight':
      wins = n === bet.number;
      multiple = 36n;
      break;
    case 'color':
      wins = n !== 0 && pocketColor(n) === bet.value;
      break;
    case 'parity':
      wins = n !== 0 && (bet.value === 'odd' ? n % 2 === 1 : n % 2 === 0);
      break;
    case 'range':
      wins = bet.value === 'low' ? n >= 1 && n <= 18 : n >= 19 && n <= 36;
      break;
    case 'dozen':
      wins = n >= 1 && n >= (bet.value - 1) * 12 + 1 && n <= bet.value * 12;
      multiple = 3n;
      break;
    case 'column':
      wins = n !== 0 && n % 3 === bet.value % 3;
      multiple = 3n;
      break;
  }
  return wins ? bet.amount * multiple : 0n;
}

export function settleSpin(n: number, bets: readonly RouletteBet[]) {
  const lines = bets.map((bet) => ({ ...bet, amount: bet.amount.toString(), returned: betReturn(bet, n) }));
  const payout = lines.reduce((sum, line) => sum + line.returned, 0n);
  return {
    payout,
    result: {
      number: n,
      color: pocketColor(n),
      bets: lines.map((line) => ({ ...line, returned: line.returned.toString() })),
    },
  };
}

function parseAmount(raw: unknown): bigint {
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,11}$/.test(raw))
    throw engineError('INVALID_PARAMS', 'Invalid bet amount');
  return BigInt(raw);
}

function parseBet(raw: unknown): RouletteBet {
  const bet = (raw ?? {}) as Record<string, unknown>;
  const amount = parseAmount(bet.amount);
  const oneOf = (values: readonly unknown[]) => {
    if (!values.includes(bet.value)) throw engineError('INVALID_PARAMS', 'Invalid bet');
  };
  switch (bet.type) {
    case 'straight':
      if (typeof bet.number !== 'number' || !Number.isInteger(bet.number) || bet.number < 0 || bet.number > 36)
        throw engineError('INVALID_PARAMS', 'Invalid number');
      return { type: 'straight', number: bet.number, amount };
    case 'color':
      oneOf(['red', 'black']);
      return { type: 'color', value: bet.value as 'red' | 'black', amount };
    case 'parity':
      oneOf(['odd', 'even']);
      return { type: 'parity', value: bet.value as 'odd' | 'even', amount };
    case 'range':
      oneOf(['low', 'high']);
      return { type: 'range', value: bet.value as 'low' | 'high', amount };
    case 'dozen':
    case 'column':
      oneOf([1, 2, 3]);
      return { type: bet.type, value: bet.value as 1 | 2 | 3, amount };
    default:
      throw engineError('INVALID_PARAMS', 'Unknown bet type');
  }
}

const serialise = (bets: RouletteBet[]): StoredBet[] => bets.map((bet) => ({ ...bet, amount: bet.amount.toString() }));
const revive = (bets: StoredBet[]): RouletteBet[] =>
  bets.map((bet) => ({ ...bet, amount: BigInt(bet.amount) }) as RouletteBet);

export const roulette: GameModule<{ number: number }, never> = {
  id: 'spice-wheel',
  minWager: 10n,
  maxWager: 100_000n,
  parseParams(raw) {
    const list = (raw as { bets?: unknown } | null)?.bets;
    if (!Array.isArray(list) || list.length < 1 || list.length > MAX_BETS)
      throw engineError('INVALID_PARAMS', `Place between 1 and ${MAX_BETS} bets`);
    return { bets: serialise(list.map(parseBet)) };
  },
  validate(wager, params) {
    const total = revive((params as { bets: StoredBet[] }).bets).reduce((sum, bet) => sum + bet.amount, 0n);
    if (total !== wager) throw engineError('INVALID_PARAMS', 'The wager must equal the sum of the bets');
  },
  parseAction() {
    throw engineError('INVALID_ACTION', 'This game has no actions');
  },
  start(rng, _wager, params) {
    const number = rng.int(37);
    return { state: { number }, settlement: settleSpin(number, revive((params as { bets: StoredBet[] }).bets)) };
  },
  act: (state) => ({ state }),
  view: (state) => ({ number: state.number, color: pocketColor(state.number) }),
};
