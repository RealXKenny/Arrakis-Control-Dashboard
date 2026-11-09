import { z } from 'zod';

export const EVENT_LIMIT = 50;
export const eventIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/);
export const eventStatusSchema = z.enum(['upcoming', 'open', 'judging', 'completed', 'cancelled']);
const fields = {
  title: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(10).max(300),
  description: z.string().trim().min(10).max(4_000),
  rules: z.string().trim().max(4_000).default(''),
  participation: z.string().trim().max(2_000).default(''),
  prizeSolaris: z.number().int().min(0).max(1_000_000_000_000),
  prizeItems: z.string().trim().max(500).default(''),
  startsAt: z.string().datetime().nullable().default(null),
  endsAt: z.string().datetime().nullable().default(null),
  status: eventStatusSchema,
  visibility: z.enum(['draft', 'published']),
  featured: z.boolean().default(false),
};
const orderedDates = (event: { startsAt?: string | null; endsAt?: string | null }) =>
  !event.startsAt || !event.endsAt || Date.parse(event.endsAt) > Date.parse(event.startsAt);
export const eventInputSchema = z
  .object(fields)
  .refine(orderedDates, { message: 'The end must be after the start.', path: ['endsAt'] });
export const communityEventSchema = z
  .object({
    ...fields,
    id: eventIdSchema,
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .refine(orderedDates, { message: 'Invalid event schedule.' });
export type EventInput = z.infer<typeof eventInputSchema>;
export type CommunityEvent = z.infer<typeof communityEventSchema>;
export const EVENT_STATUS_LABELS: Record<CommunityEvent['status'], string> = {
  upcoming: 'Coming soon',
  open: 'Open for entries',
  judging: 'Judging',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function firstCommunityEvent(now = new Date().toISOString()): CommunityEvent {
  return {
    id: 'base-building-competition',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    title: 'Base Building Competition',
    summary: 'Our first community event. Bring your best base design to Arrakis.',
    description:
      'Show the community what you can build. Our first base-building competition celebrates the creativity of our players and the bases they call home.',
    prizeSolaris: 500_000,
    prizeItems: 'A couple of new in-game items. Item details to be announced.',
    participation: 'Entry details and judging criteria will be announced here.',
    rules: '',
    startsAt: null,
    endsAt: null,
    status: 'upcoming',
    visibility: 'published',
    featured: true,
  };
}
