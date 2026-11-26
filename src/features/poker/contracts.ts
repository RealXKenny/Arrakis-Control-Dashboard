// Browser-safe request schemas and response shapes shared by the poker Activity client and its routes.
import { z } from 'zod';
import type { TableView } from './engine/table';

/** Discord snowflakes and Activity instance IDs, kept conservative so they are safe in Redis keys. */
export const SNOWFLAKE = /^\d{15,25}$/;
export const INSTANCE_ID = /^[A-Za-z0-9_-]{1,100}$/;
/** Server-assigned IDs of AI seats. */
export const BOT_ID = /^ai-[1-9]$/;
/** Seats per table, people and AI players together. */
export const MAX_SEATS = 4;

export const sessionRequestSchema = z
  .object({
    code: z
      .string()
      .min(1)
      .max(512)
      .regex(/^[A-Za-z0-9._~-]+$/),
    instanceId: z.string().regex(INSTANCE_ID),
  })
  .strict();

export const tableActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('join') }).strict(),
  z.object({ action: z.literal('leave') }).strict(),
  z.object({ action: z.literal('deal') }).strict(),
  z.object({ action: z.literal('add-bot') }).strict(),
  z.object({ action: z.literal('remove-bot'), playerId: z.string().regex(BOT_ID) }).strict(),
  z.object({ action: z.literal('fold') }).strict(),
  z.object({ action: z.literal('check') }).strict(),
  z.object({ action: z.literal('call') }).strict(),
  z.object({ action: z.literal('all-in') }).strict(),
  z.object({ action: z.literal('bet'), amount: z.number().int().min(1).max(10_000_000) }).strict(),
  z.object({ action: z.literal('raise'), amount: z.number().int().min(1).max(10_000_000) }).strict(),
]);
export type TableActionInput = z.infer<typeof tableActionSchema>;

export interface ActivitySessionResponse {
  readonly ok: true;
  readonly token: string;
  readonly expiresAt: number;
  readonly player: { readonly id: string; readonly displayName: string };
}

export interface PokerTableResponse {
  readonly ok: true;
  readonly revision: string;
  /** Epoch milliseconds when the current turn is auto-played, or null. */
  readonly turnDeadline: number | null;
  readonly seated: boolean;
  readonly table: TableView;
}

export interface PokerErrorResponse {
  readonly ok: false;
  readonly error: string;
  readonly code: string;
}

/** Seconds a player has to act before the shot clock checks or folds for them. */
export const TURN_SECONDS = 30;
