import '../../../lib/assert-server';
import { AppError } from '../../../lib/errors';
import { playBotTurn } from '../engine/ai';
import { PokerError, PokerTable } from '../engine/table';
import { TURN_SECONDS, type PokerTableResponse, type TableActionInput } from '../contracts';
import type { ActivitySession } from './session';
import { type TableRecord, readTable, tableConflict, writeTable } from './store';

const CAS_ATTEMPTS = 3;
const TURN_MS = TURN_SECONDS * 1000;
/** AI players wait a moment so people can follow the action. */
const BOT_TURN_MS = 1200;

function load(record: TableRecord | null): PokerTable {
  return record ? PokerTable.fromSnapshot(record.table) : new PokerTable();
}

function turnSinceAfter(
  table: PokerTable,
  before: { turn: number; handNumber: number; street: string },
  previous: number | null,
  now: number,
) {
  if (table.turn === -1) return null;
  const moved = table.turn !== before.turn || table.handNumber !== before.handNumber || table.street !== before.street;
  return moved || previous === null ? now : previous;
}

/**
 * Plays every AI turn that is due and every expired shot clock, so neither a computer opponent nor a
 * player who walked away can stall the table. Each turn's clock starts when the previous one was due.
 */
function advanceClock(
  table: PokerTable,
  turnSince: number | null,
  now: number,
): { changed: boolean; turnSince: number | null } {
  let since = turnSince;
  let changed = false;
  for (let guard = 0; guard < 60 && table.turn !== -1 && since !== null; guard += 1) {
    const seat = table.seats[table.turn];
    const wait = seat?.isBot ? BOT_TURN_MS : TURN_MS;
    if (now - since < wait) break;
    const before = { turn: table.turn, handNumber: table.handNumber, street: table.street };
    if (seat?.isBot) playBotTurn(table);
    else table.timeoutTurn();
    changed = true;
    since = turnSinceAfter(table, before, null, since + wait);
  }
  return { changed, turnSince: table.turn === -1 ? null : since };
}

function respond(record: TableRecord, playerId: string): PokerTableResponse {
  const table = load(record);
  return {
    ok: true,
    revision: record.revision,
    turnDeadline: record.turnSince === null ? null : record.turnSince + TURN_MS,
    seated: table.seats.some((seat) => seat.playerId === playerId && !seat.leaving),
    table: table.viewFor(playerId),
  };
}

/**
 * Read-modify-write with a revision check. `mutate` returns false when it changed nothing; a lost
 * race re-reads and re-applies, which is safe because nothing leaves Redis until the write lands.
 */
async function update(
  instanceId: string,
  playerId: string,
  mutate: ((table: PokerTable) => boolean) | null,
): Promise<PokerTableResponse> {
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const record = await readTable(instanceId);
    const now = Date.now();
    const table = load(record);
    const clock = advanceClock(table, record?.turnSince ?? null, now);
    const before = { turn: table.turn, handNumber: table.handNumber, street: table.street };
    let changed = clock.changed;
    if (mutate) {
      try {
        changed = mutate(table) || changed;
      } catch (error) {
        if (error instanceof PokerError) throw new AppError(error.message, 409, 'POKER_RULE', true);
        throw error;
      }
    }
    if (!changed && record) return respond(record, playerId);
    if (!changed) {
      // Nobody has touched this table yet: show an empty one without creating a record.
      return {
        ok: true,
        revision: '',
        turnDeadline: null,
        seated: false,
        table: table.viewFor(playerId),
      };
    }
    try {
      const saved = await writeTable(instanceId, record?.revision ?? null, {
        turnSince: turnSinceAfter(table, before, clock.turnSince, now),
        table: table.toSnapshot(),
      });
      return respond(saved, playerId);
    } catch (error) {
      if (error instanceof AppError && error.code === 'POKER_CONFLICT' && attempt < CAS_ATTEMPTS - 1) continue;
      throw error;
    }
  }
  throw tableConflict();
}

export function readPokerTable(session: ActivitySession): Promise<PokerTableResponse> {
  return update(session.instanceId, session.userId, null);
}

export function actOnPokerTable(session: ActivitySession, input: TableActionInput): Promise<PokerTableResponse> {
  const { userId, displayName } = session;
  return update(session.instanceId, userId, (table) => {
    switch (input.action) {
      case 'join':
        table.join(userId, displayName);
        return true;
      case 'leave':
        table.leave(userId);
        // AI players only keep people company; they never sit at an empty table.
        if (table.humanCount() === 0) {
          for (const seat of [...table.seats]) if (seat.isBot && !seat.leaving) table.removeBot(seat.playerId);
        }
        return true;
      case 'add-bot':
        requireSeat(table, userId, 'Take a seat before adding an AI player.');
        table.addBot();
        return true;
      case 'remove-bot':
        requireSeat(table, userId, 'Take a seat before removing an AI player.');
        table.removeBot(input.playerId);
        return true;
      case 'deal':
        requireSeat(table, userId, 'Take a seat before dealing.');
        table.startHand();
        return true;
      case 'bet':
      case 'raise':
        table.act(userId, { type: input.action, amount: input.amount });
        return true;
      default:
        table.act(userId, { type: input.action });
        return true;
    }
  });
}

function requireSeat(table: PokerTable, userId: string, message: string): void {
  if (!table.seats.some((seat) => seat.playerId === userId && !seat.leaving)) throw new PokerError(message);
}
