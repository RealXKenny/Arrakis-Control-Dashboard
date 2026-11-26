import { z } from 'zod';
import { MAP_NAMES } from '../map/maps';

/**
 * N040 opt-in rescue request cards. Browser-safe schema shared by the editor, API and Redis record. The card holds
 * only what the requester types or selects; it never reads a live position, inventory or Discord identity.
 */
export const RESCUE_ASSISTANCE = ['fuel', 'repair', 'transport', 'water', 'escort', 'other'] as const;
export const RESCUE_ASSISTANCE_LABELS: Record<(typeof RESCUE_ASSISTANCE)[number], string> = {
  fuel: 'Fuel',
  repair: 'Vehicle repair',
  transport: 'Transport out',
  water: 'Water or healing',
  escort: 'Escort',
  other: 'Other (see details)',
};
export const RESCUE_HOURS = [1, 2, 6] as const;

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Control characters');
const coordinate = z.number().finite().min(-10_000_000).max(10_000_000);

export const rescueDataSchema = z
  .object({
    callSign: text(40).pipe(z.string().min(1)),
    map: z.enum(MAP_NAMES),
    x: coordinate.nullable(),
    y: coordinate.nullable(),
    place: text(120).pipe(z.string().min(1)),
    assistance: z
      .array(z.enum(RESCUE_ASSISTANCE))
      .min(1)
      .max(RESCUE_ASSISTANCE.length)
      .refine((values) => new Set(values).size === values.length, 'Duplicate assistance'),
    details: text(500),
  })
  .strict()
  .refine((data) => (data.x === null) === (data.y === null), 'Both coordinates or neither');

export const rescueActionSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('publish'),
      data: rescueDataSchema,
      hours: z.union([z.literal(1), z.literal(2), z.literal(6)]),
      confirmed: z.literal(true),
      expected: z
        .string()
        .regex(/^[0-9a-f]{64}$/)
        .nullable(),
    })
    .strict(),
  z.object({ action: z.literal('cancel'), expected: z.string().regex(/^[0-9a-f]{64}$/) }).strict(),
]);

export type RescueData = z.infer<typeof rescueDataSchema>;
export type RescueAction = z.infer<typeof rescueActionSchema>;

/** What a viewer receives: the requester's own card text and server-owned times, nothing else. */
export interface RescueCard {
  data: RescueData;
  publishedAt: string;
  expiresAt: string;
}

/** What the owner receives: their active card plus its unlisted link token. */
export interface RescueOwnerView {
  active: (RescueCard & { shareId: string; tag: string }) | null;
}

export const SHARE_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;
