import '../../../lib/assert-server';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { SUITS } from '../engine/cards';
import type { PokerTableSnapshot } from '../engine/table';
import { BOT_ID, INSTANCE_ID, SNOWFLAKE } from '../contracts';

const PLAYER_ID = z.union([z.string().regex(SNOWFLAKE), z.string().regex(BOT_ID)]);

const MAX_BYTES = 64 * 1024;
/** Tables of abandoned Activities disappear on their own. */
const RETENTION_SECONDS = 6 * 60 * 60;

const READ = `-- poker-table-read-v1
if redis.call('STRLEN', KEYS[1]) > tonumber(ARGV[1]) then return false end
local value = redis.call('GET', KEYS[1])
return value or ''`;
const SAVE = `-- poker-table-save-v1
local old = redis.call('GET', KEYS[1])
if old then
 local ok, value = pcall(cjson.decode, old)
 if not ok or type(value) ~= 'table' then return 'invalid' end
 if value.revision ~= ARGV[1] then return 'conflict' end
elseif ARGV[1] ~= '' then return 'conflict' end
if string.len(ARGV[2]) > tonumber(ARGV[4]) then return 'invalid' end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
return 'ok'`;

const card = z.object({ rank: z.number().int().min(2).max(14), suit: z.enum(SUITS) }).strict();
const chips = z.number().int().min(0).max(1_000_000_000);
const seat = z
  .object({
    playerId: PLAYER_ID,
    displayName: z.string().min(1).max(32),
    stack: chips,
    hole: z.array(card).max(2),
    streetBet: chips,
    handBet: chips,
    folded: z.boolean(),
    allIn: z.boolean(),
    acted: z.boolean(),
    sittingOut: z.boolean(),
    leaving: z.boolean(),
    missedTurns: z.number().int().min(0).max(100),
    isBot: z.boolean(),
  })
  .strict();
const handValue = z
  .object({ category: z.number().int().min(0).max(8), score: z.array(z.number().int().min(0).max(14)).max(6) })
  .strict();
const snapshotSchema = z
  .object({
    version: z.literal(1),
    config: z
      .object({
        smallBlind: chips,
        bigBlind: chips,
        startingStack: chips,
        maxSeats: z.number().int().min(2).max(10),
      })
      .strict(),
    seats: z.array(seat).max(10),
    street: z.enum(['waiting', 'preflop', 'flop', 'turn', 'river', 'showdown']),
    board: z.array(card).max(5),
    button: z.number().int().min(-1).max(10),
    turn: z.number().int().min(-1).max(10),
    currentBet: chips,
    minRaise: chips,
    handNumber: z.number().int().min(0),
    deck: z.array(card).max(52),
    lastResult: z
      .object({
        pots: z
          .array(
            z
              .object({
                amount: chips,
                winners: z.array(PLAYER_ID).max(10),
                hand: z.string().max(32).nullable(),
              })
              .strict(),
          )
          .max(10),
        shown: z.array(z.tuple([PLAYER_ID, handValue])).max(10),
      })
      .strict()
      .nullable(),
  })
  .strict();
const recordSchema = z
  .object({
    revision: z.string().uuid(),
    updatedAt: z.number().int().positive(),
    /** Epoch milliseconds the current turn began, for the shot clock. */
    turnSince: z.number().int().positive().nullable(),
    table: snapshotSchema,
  })
  .strict();

export interface TableRecord {
  readonly revision: string;
  readonly updatedAt: number;
  readonly turnSince: number | null;
  readonly table: PokerTableSnapshot;
}

const unavailable = () => new AppError('Poker is unavailable. Try again shortly.', 503, 'POKER_UNAVAILABLE', true);
export const tableConflict = () => new AppError('The table changed. Try again.', 409, 'POKER_CONFLICT', true);

/** One table per Discord Activity instance; the instance ID is hashed so keys stay uniform. */
export function pokerTableKey(instanceId: string): string {
  if (!INSTANCE_ID.test(instanceId)) throw unavailable();
  return `arrakis:poker:table:v1:${createHash('sha256').update(instanceId).digest('hex')}`;
}

function redis() {
  const client = getRedisClient();
  if (!client) throw unavailable();
  return client;
}

export async function readTable(instanceId: string): Promise<TableRecord | null> {
  let value: unknown;
  try {
    value = await redis().eval(READ, [pokerTableKey(instanceId)], [MAX_BYTES]);
  } catch {
    throw unavailable();
  }
  if (value === '') return null;
  if (typeof value !== 'string') throw unavailable();
  try {
    // The schema checks shape and bounds; engine types are narrower than what zod infers.
    return recordSchema.parse(JSON.parse(value)) as unknown as TableRecord;
  } catch {
    throw unavailable();
  }
}

/** Compare-and-set on the revision so two players acting at once can never both apply. */
export async function writeTable(
  instanceId: string,
  expectedRevision: string | null,
  next: Omit<TableRecord, 'revision' | 'updatedAt'>,
): Promise<TableRecord> {
  const record: TableRecord = { ...next, revision: randomUUID(), updatedAt: Date.now() };
  const checked = recordSchema.safeParse(record);
  if (!checked.success) throw unavailable();
  let result: unknown;
  try {
    result = await redis().eval(
      SAVE,
      [pokerTableKey(instanceId)],
      [expectedRevision ?? '', JSON.stringify(record), RETENTION_SECONDS, MAX_BYTES],
    );
  } catch {
    throw unavailable();
  }
  if (result === 'conflict') throw tableConflict();
  if (result !== 'ok') throw unavailable();
  return record;
}
