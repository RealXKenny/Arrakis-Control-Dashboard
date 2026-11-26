// Pure, browser-safe Texas Hold'em table: seats, blinds, betting rounds, side pots, showdown.
// Play money only: chip counts are small safe integers and never map to real currency.
import {
  type Card,
  type HandValue,
  type RandomInt,
  HAND_NAMES,
  compareHands,
  evaluateHand,
  newDeck,
  shuffle,
} from './cards';

export type Street = 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'all-in';

export interface PokerAction {
  readonly type: ActionType;
  /** For bet/raise: the total amount this player's street contribution becomes. */
  readonly amount?: number;
}

export interface Seat {
  readonly playerId: string;
  readonly displayName: string;
  stack: number;
  hole: Card[];
  /** Chips put in on the current street. */
  streetBet: number;
  /** Chips put in across the whole hand (for side pots). */
  handBet: number;
  folded: boolean;
  allIn: boolean;
  /** Has acted since the last full raise on this street. */
  acted: boolean;
  /** Not dealt into the current hand (joined mid-hand or leaving). */
  sittingOut: boolean;
  /** Asked to leave; removed when the hand ends. */
  leaving: boolean;
  /** Consecutive turns lost to the shot clock; resets when the player acts. */
  missedTurns: number;
  /** A computer opponent played by the server. */
  isBot: boolean;
}

export interface TableConfig {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly startingStack: number;
  readonly maxSeats: number;
}

export interface PotResult {
  readonly amount: number;
  readonly winners: readonly string[];
  readonly hand: string | null;
}

export interface HandResult {
  readonly pots: readonly PotResult[];
  readonly shown: ReadonlyMap<string, HandValue>;
}

export class PokerError extends Error {}

export const MAX_MISSED_TURNS = 2;

export const DEFAULT_TABLE_CONFIG: TableConfig = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxSeats: 4 };

export class PokerTable {
  readonly config: TableConfig;
  readonly seats: Seat[] = [];
  street: Street = 'waiting';
  board: Card[] = [];
  button = -1;
  /** Seat index whose turn it is, or -1. */
  turn = -1;
  currentBet = 0;
  minRaise = 0;
  handNumber = 0;
  lastResult: HandResult | null = null;
  private deck: Card[] = [];
  private readonly random: RandomInt | undefined;

  constructor(config: Partial<TableConfig> = {}, random?: RandomInt) {
    this.config = { ...DEFAULT_TABLE_CONFIG, ...config };
    if (this.config.bigBlind <= 0 || this.config.smallBlind <= 0 || this.config.smallBlind > this.config.bigBlind) {
      throw new PokerError('Blinds must be positive and the small blind cannot exceed the big blind.');
    }
    if (this.config.maxSeats < 2 || this.config.maxSeats > 10) throw new PokerError('A table seats 2 to 10 players.');
    this.random = random;
  }

  join(playerId: string, displayName: string): Seat {
    const existing = this.seats.find((seat) => seat.playerId === playerId);
    if (existing?.leaving) {
      // Changed their mind before the hand ended: keep the seat and chips.
      existing.leaving = false;
      existing.missedTurns = 0;
      return existing;
    }
    if (existing) throw new PokerError('You are already seated.');
    if (this.occupiedSeats() >= this.config.maxSeats) {
      // A person always outranks a computer opponent: the newest AI gives up its seat.
      const bot = [...this.seats].reverse().find((candidate) => candidate.isBot && !candidate.leaving);
      if (!bot) throw new PokerError('The table is full.');
      this.leave(bot.playerId);
    }
    return this.seat(playerId, displayName, false);
  }

  /** Adds a computer opponent for players who cannot find a second person. */
  addBot(): Seat {
    if (this.occupiedSeats() >= this.config.maxSeats) throw new PokerError('The table is full.');
    const taken = new Set(this.seats.map((seat) => seat.playerId));
    for (let number = 1; number <= this.config.maxSeats; number += 1) {
      const id = `ai-${number}`;
      if (!taken.has(id)) return this.seat(id, `AI player ${number}`, true);
    }
    throw new PokerError('The table is full.');
  }

  removeBot(playerId: string): void {
    const seat = this.seats.find((candidate) => candidate.playerId === playerId);
    if (!seat?.isBot) throw new PokerError('That seat is not an AI player.');
    if (!seat.leaving) this.leave(playerId);
  }

  /** Seats that count toward the limit: everyone except players already on their way out. */
  occupiedSeats(): number {
    return this.seats.filter((seat) => !seat.leaving).length;
  }

  humanCount(): number {
    return this.seats.filter((seat) => !seat.isBot && !seat.leaving).length;
  }

  private seat(playerId: string, displayName: string, isBot: boolean): Seat {
    const seat: Seat = {
      playerId,
      displayName,
      stack: this.config.startingStack,
      hole: [],
      streetBet: 0,
      handBet: 0,
      // Players joining mid-hand wait for the next deal.
      folded: this.isHandLive(),
      allIn: false,
      acted: false,
      sittingOut: this.isHandLive(),
      leaving: false,
      missedTurns: 0,
      isBot,
    };
    this.seats.push(seat);
    return seat;
  }

  /** Leaving mid-hand folds the player; the seat is removed once the hand ends. */
  leave(playerId: string): void {
    const index = this.indexOf(playerId);
    const seat = this.seats[index] as Seat;
    if (!this.isHandLive()) {
      this.removeSeat(index);
      return;
    }
    seat.leaving = true;
    if (!seat.folded) {
      if (this.turn === index) {
        this.act(playerId, { type: 'fold' });
      } else {
        // Folding out of turn never moves the action; it can only end the hand.
        seat.folded = true;
        if (this.seats.filter((s) => !s.folded).length <= 1) this.finish();
      }
    }
  }

  isHandLive(): boolean {
    return this.street !== 'waiting' && this.street !== 'showdown';
  }

  canStart(): boolean {
    // Computer opponents never play among themselves.
    return (
      !this.isHandLive() &&
      this.seats.filter((s) => s.stack > 0 && !s.leaving).length >= 2 &&
      this.seats.some((s) => s.stack > 0 && !s.leaving && !s.isBot)
    );
  }

  startHand(): void {
    if (!this.canStart()) throw new PokerError('At least two players with chips are needed to deal.');
    // Clear out players who left or busted.
    for (let i = this.seats.length - 1; i >= 0; i -= 1) {
      const seat = this.seats[i] as Seat;
      if (seat.stack <= 0 || seat.leaving) this.removeSeat(i);
    }
    this.handNumber += 1;
    this.lastResult = null;
    this.board = [];
    this.deck = shuffle(newDeck(), this.random);
    for (const seat of this.seats) {
      seat.hole = [];
      seat.streetBet = 0;
      seat.handBet = 0;
      seat.sittingOut = false;
      seat.folded = false;
      seat.allIn = false;
      seat.acted = false;
    }
    this.button = this.nextActive(this.button);
    const headsUp = this.activeIndexes().length === 2;
    const sb = headsUp ? this.button : this.nextActive(this.button);
    const bb = this.nextActive(sb);
    this.post(sb, this.config.smallBlind);
    this.post(bb, this.config.bigBlind);
    this.currentBet = this.config.bigBlind;
    this.minRaise = this.config.bigBlind;
    for (let round = 0; round < 2; round += 1) {
      for (const index of this.activeIndexes()) (this.seats[index] as Seat).hole.push(this.draw());
    }
    this.street = 'preflop';
    this.turn = this.nextToAct(bb);
    if (this.turn === -1) this.runOut();
  }

  /** Legal options for the player to act, for rendering controls. */
  legalActions(playerId: string): { canCheck: boolean; toCall: number; minRaiseTo: number; maxRaiseTo: number } | null {
    const index = this.seats.findIndex((s) => s.playerId === playerId);
    if (index === -1 || index !== this.turn) return null;
    const seat = this.seats[index] as Seat;
    const toCall = Math.min(this.currentBet - seat.streetBet, seat.stack);
    const maxRaiseTo = seat.streetBet + seat.stack;
    return {
      canCheck: toCall === 0,
      toCall,
      minRaiseTo: Math.min(this.currentBet + this.minRaise, maxRaiseTo),
      maxRaiseTo,
    };
  }

  act(playerId: string, action: PokerAction): void {
    const index = this.indexOf(playerId);
    if (index !== this.turn) throw new PokerError('It is not your turn.');
    const seat = this.seats[index] as Seat;
    const toCall = this.currentBet - seat.streetBet;

    switch (action.type) {
      case 'fold':
        seat.folded = true;
        break;
      case 'check':
        if (toCall > 0) throw new PokerError('You cannot check facing a bet.');
        break;
      case 'call':
        if (toCall <= 0) throw new PokerError('There is nothing to call.');
        this.commit(seat, Math.min(toCall, seat.stack));
        break;
      case 'bet':
      case 'raise': {
        const target = action.amount;
        if (target === undefined || !Number.isSafeInteger(target)) throw new PokerError('Enter a whole chip amount.');
        if (action.type === 'bet' && this.currentBet > 0)
          throw new PokerError('There is already a bet; raise instead.');
        if (action.type === 'raise' && this.currentBet === 0)
          throw new PokerError('There is no bet to raise; bet instead.');
        const maxTo = seat.streetBet + seat.stack;
        if (target > maxTo) throw new PokerError('You do not have that many chips.');
        const isAllIn = target === maxTo;
        if (target < this.currentBet + this.minRaise && !isAllIn) {
          throw new PokerError(`The minimum is ${this.currentBet + this.minRaise}.`);
        }
        this.raiseTo(seat, target);
        break;
      }
      case 'all-in': {
        const target = seat.streetBet + seat.stack;
        if (target <= this.currentBet) this.commit(seat, seat.stack);
        else this.raiseTo(seat, target);
        break;
      }
      default:
        throw new PokerError('Unknown action.');
    }
    seat.acted = true;
    seat.missedTurns = 0;
    this.afterAction();
  }

  /**
   * The shot clock ran out for the player to act: check when free, otherwise fold. After
   * MAX_MISSED_TURNS in a row the player is treated as gone and leaves at the end of the hand.
   */
  timeoutTurn(): string | null {
    if (!this.isHandLive() || this.turn === -1) return null;
    const seat = this.seats[this.turn] as Seat;
    const missed = seat.missedTurns + 1;
    this.act(seat.playerId, { type: this.currentBet - seat.streetBet > 0 ? 'fold' : 'check' });
    seat.missedTurns = missed;
    if (missed >= MAX_MISSED_TURNS && this.seats.includes(seat)) this.leave(seat.playerId);
    return seat.playerId;
  }

  toSnapshot(): PokerTableSnapshot {
    return {
      version: 1,
      config: { ...this.config },
      seats: this.seats.map((seat) => ({ ...seat, hole: [...seat.hole] })),
      street: this.street,
      board: [...this.board],
      button: this.button,
      turn: this.turn,
      currentBet: this.currentBet,
      minRaise: this.minRaise,
      handNumber: this.handNumber,
      deck: [...this.deck],
      lastResult: this.lastResult
        ? {
            pots: this.lastResult.pots.map((pot) => ({ ...pot, winners: [...pot.winners] })),
            shown: [...this.lastResult.shown],
          }
        : null,
    };
  }

  /** Rebuilds a table from a stored snapshot; the caller must validate untrusted input first. */
  static fromSnapshot(snapshot: PokerTableSnapshot, random?: RandomInt): PokerTable {
    const table = new PokerTable(snapshot.config, random);
    for (const seat of snapshot.seats) table.seats.push({ ...seat, hole: [...seat.hole] });
    table.street = snapshot.street;
    table.board = [...snapshot.board];
    table.button = snapshot.button;
    table.turn = snapshot.turn;
    table.currentBet = snapshot.currentBet;
    table.minRaise = snapshot.minRaise;
    table.handNumber = snapshot.handNumber;
    table.deck = [...snapshot.deck];
    table.lastResult = snapshot.lastResult
      ? { pots: snapshot.lastResult.pots, shown: new Map(snapshot.lastResult.shown) }
      : null;
    return table;
  }

  /** What a given viewer may see: their own hole cards, everyone's at showdown. */
  viewFor(viewerId: string | null): TableView {
    return {
      street: this.street,
      handNumber: this.handNumber,
      board: [...this.board],
      pot: this.seats.reduce((sum, s) => sum + s.handBet, 0),
      currentBet: this.currentBet,
      button: this.button,
      turn: this.turn,
      seats: this.seats.map((seat) => {
        const revealed =
          seat.playerId === viewerId ||
          (this.street === 'showdown' && !seat.folded && this.lastResult?.shown.has(seat.playerId) === true);
        return {
          playerId: seat.playerId,
          displayName: seat.displayName,
          stack: seat.stack,
          streetBet: seat.streetBet,
          folded: seat.folded,
          allIn: seat.allIn,
          sittingOut: seat.sittingOut,
          isBot: seat.isBot,
          hole: revealed ? [...seat.hole] : seat.hole.map(() => null),
        };
      }),
      legal: viewerId ? this.legalActions(viewerId) : null,
      result: this.lastResult ? { pots: this.lastResult.pots.map((p) => ({ ...p, winners: [...p.winners] })) } : null,
    };
  }

  // --- internals ---

  private indexOf(playerId: string): number {
    const index = this.seats.findIndex((s) => s.playerId === playerId);
    if (index === -1) throw new PokerError('You are not seated at this table.');
    return index;
  }

  private removeSeat(index: number): void {
    this.seats.splice(index, 1);
    if (this.button >= index) this.button -= 1;
    if (this.turn > index) this.turn -= 1;
  }

  private draw(): Card {
    const card = this.deck.pop();
    if (!card) throw new PokerError('The deck ran out.');
    return card;
  }

  private activeIndexes(): number[] {
    return this.seats.flatMap((s, i) => (!s.sittingOut && s.stack + s.handBet > 0 ? [i] : []));
  }

  private nextActive(from: number): number {
    const n = this.seats.length;
    for (let step = 1; step <= n; step += 1) {
      const i = (((from + step) % n) + n) % n;
      const seat = this.seats[i] as Seat;
      if (!seat.sittingOut && (seat.stack > 0 || seat.handBet > 0)) return i;
    }
    return -1;
  }

  /** Next seat after `from` that still needs to act this street, or -1. */
  private nextToAct(from: number): number {
    const n = this.seats.length;
    for (let step = 1; step <= n; step += 1) {
      const i = (from + step) % n;
      const seat = this.seats[i] as Seat;
      if (seat.folded || seat.allIn) continue;
      if (!seat.acted || seat.streetBet < this.currentBet) return i;
    }
    return -1;
  }

  private post(index: number, amount: number): void {
    const seat = this.seats[index] as Seat;
    this.commit(seat, Math.min(amount, seat.stack));
  }

  private commit(seat: Seat, amount: number): void {
    seat.stack -= amount;
    seat.streetBet += amount;
    seat.handBet += amount;
    if (seat.stack === 0) seat.allIn = true;
  }

  private raiseTo(seat: Seat, target: number): void {
    const raiseSize = target - this.currentBet;
    this.commit(seat, target - seat.streetBet);
    // Only a full raise reopens action; a short all-in just raises the price.
    if (raiseSize >= this.minRaise) {
      this.minRaise = raiseSize;
      for (const other of this.seats) if (other !== seat) other.acted = false;
    }
    this.currentBet = Math.max(this.currentBet, target);
  }

  private afterAction(): void {
    const live = this.seats.filter((s) => !s.folded);
    if (live.length <= 1) {
      this.finish();
      return;
    }
    const next = this.nextToAct(this.turn);
    if (next !== -1) {
      this.turn = next;
      return;
    }
    this.advanceStreet();
  }

  private advanceStreet(): void {
    for (const seat of this.seats) {
      seat.streetBet = 0;
      seat.acted = false;
    }
    this.currentBet = 0;
    this.minRaise = this.config.bigBlind;
    if (this.street === 'preflop') {
      this.board.push(this.draw(), this.draw(), this.draw());
      this.street = 'flop';
    } else if (this.street === 'flop') {
      this.board.push(this.draw());
      this.street = 'turn';
    } else if (this.street === 'turn') {
      this.board.push(this.draw());
      this.street = 'river';
    } else {
      this.finish();
      return;
    }
    const canAct = this.seats.filter((s) => !s.folded && !s.allIn);
    if (canAct.length < 2) {
      this.runOut();
      return;
    }
    this.turn = this.nextToAct(this.button);
  }

  /** No more betting possible: deal the rest and show down. */
  private runOut(): void {
    while (this.board.length < 5) this.board.push(this.draw());
    this.finish();
  }

  private finish(): void {
    const live = this.seats.filter((s) => !s.folded);
    const shown = new Map<string, HandValue>();
    const pots: PotResult[] = [];

    if (live.length === 1) {
      const winner = live[0] as Seat;
      const total = this.seats.reduce((sum, s) => sum + s.handBet, 0);
      winner.stack += total;
      pots.push({ amount: total, winners: [winner.playerId], hand: null });
    } else {
      while (this.board.length < 5) this.board.push(this.draw());
      for (const seat of live) shown.set(seat.playerId, evaluateHand([...seat.hole, ...this.board]));
      // Build side pots from contribution levels.
      const levels = [...new Set(this.seats.map((s) => s.handBet).filter((b) => b > 0))].sort((a, b) => a - b);
      let previous = 0;
      for (const level of levels) {
        const amount = this.seats.reduce((sum, s) => sum + Math.max(0, Math.min(s.handBet, level) - previous), 0);
        const eligible = live.filter((s) => s.handBet >= level);
        previous = level;
        if (amount === 0) continue;
        if (eligible.length === 0) {
          // Only folded players reached this level: return it to the uncalled bettor(s).
          const contributors = this.seats.filter((s) => s.handBet >= level);
          (contributors[0] as Seat).stack += amount;
          continue;
        }
        let best: HandValue | null = null;
        let winners: Seat[] = [];
        for (const seat of eligible) {
          const value = shown.get(seat.playerId) as HandValue;
          const cmp = best ? compareHands(value, best) : 1;
          if (cmp > 0) {
            best = value;
            winners = [seat];
          } else if (cmp === 0) winners.push(seat);
        }
        // Odd chips go to the first winner left of the button.
        const ordered = this.orderFromButton(winners);
        const share = Math.floor(amount / ordered.length);
        let remainder = amount - share * ordered.length;
        for (const winner of ordered) {
          winner.stack += share + (remainder > 0 ? 1 : 0);
          if (remainder > 0) remainder -= 1;
        }
        const last = pots.at(-1);
        const winnerIds = ordered.map((s) => s.playerId);
        if (last && last.winners.join() === winnerIds.join()) {
          pots[pots.length - 1] = { ...last, amount: last.amount + amount };
        } else {
          pots.push({ amount, winners: winnerIds, hand: best ? handName(best) : null });
        }
      }
    }
    for (const seat of this.seats) {
      seat.streetBet = 0;
      seat.handBet = 0;
    }
    this.currentBet = 0;
    this.turn = -1;
    this.street = 'showdown';
    this.lastResult = { pots, shown };
    for (let i = this.seats.length - 1; i >= 0; i -= 1) {
      if ((this.seats[i] as Seat).leaving) this.removeSeat(i);
    }
  }

  private orderFromButton(players: Seat[]): Seat[] {
    const n = this.seats.length;
    return [...players].sort((a, b) => {
      const da = (this.seats.indexOf(a) - this.button + n) % n || n;
      const db = (this.seats.indexOf(b) - this.button + n) % n || n;
      return da - db;
    });
  }
}

function handName(value: HandValue): string {
  return HAND_NAMES[value.category];
}

export interface SeatView {
  readonly playerId: string;
  readonly displayName: string;
  readonly stack: number;
  readonly streetBet: number;
  readonly folded: boolean;
  readonly allIn: boolean;
  readonly sittingOut: boolean;
  readonly isBot: boolean;
  readonly hole: readonly (Card | null)[];
}

export interface TableView {
  readonly street: Street;
  readonly handNumber: number;
  readonly board: readonly Card[];
  readonly pot: number;
  readonly currentBet: number;
  readonly button: number;
  readonly turn: number;
  readonly seats: readonly SeatView[];
  readonly legal: ReturnType<PokerTable['legalActions']>;
  readonly result: { readonly pots: readonly PotResult[] } | null;
}

export interface PokerTableSnapshot {
  readonly version: 1;
  readonly config: TableConfig;
  readonly seats: readonly Seat[];
  readonly street: Street;
  readonly board: readonly Card[];
  readonly button: number;
  readonly turn: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly handNumber: number;
  readonly deck: readonly Card[];
  readonly lastResult: {
    readonly pots: readonly PotResult[];
    readonly shown: readonly (readonly [string, HandValue])[];
  } | null;
}
