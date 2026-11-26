import { z } from 'zod';
import type { InboxAlert } from './model';
const minutes = z.number().int().min(0).max(10080);
const feature = z.object({ enabled: z.boolean(), cooldownMinutes: minutes }).strict();
const clock = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const notificationConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    features: z
      .object({
        assets: feature,
        supply: feature,
        market: feature,
        operations: feature,
        events: feature.default({ enabled: true, cooldownMinutes: 0 }),
        maintenance: feature.default({ enabled: true, cooldownMinutes: 0 }),
        assistance: feature.default({ enabled: true, cooldownMinutes: 0 }),
      })
      .strict(),
    quiet: z
      .object({
        enabled: z.boolean(),
        start: clock,
        end: clock,
        timeZone: z
          .string()
          .min(1)
          .max(80)
          .refine((zone) => {
            try {
              new Intl.DateTimeFormat('en', { timeZone: zone }).format();
              return true;
            } catch {
              return false;
            }
          }),
      })
      .strict()
      .refine(
        (value) => !value.enabled || value.start !== value.end,
        'Choose different quiet-hour start and end times.',
      ),
  })
  .strict();
export type NotificationConfig = z.infer<typeof notificationConfigSchema>;
const notificationStateSchema = z
  .object({
    id: z.string().regex(/^[a-f0-9]{64}$/),
    dismissed: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    snoozedUntil: z.iso.datetime().nullable(),
    seenAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const notificationRecordSchema = z
  .object({
    revision: z.uuid().nullable(),
    config: notificationConfigSchema,
    states: z
      .array(notificationStateSchema)
      .max(120)
      .refine((states) => new Set(states.map((s) => s.id)).size === states.length),
  })
  .strict();
export type NotificationRecord = z.infer<typeof notificationRecordSchema>;
export const notificationEnvelopeSchema = z
  .object({ record: notificationRecordSchema, checkedAt: z.iso.datetime() })
  .strict();
const target = { revision: z.uuid().nullable(), id: z.string().regex(/^[a-f0-9]{64}$/) };
export const notificationInputSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('configure'), revision: z.uuid().nullable(), config: notificationConfigSchema })
    .strict(),
  z.object({ action: z.literal('dismiss'), ...target, fingerprint: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z
    .object({
      action: z.literal('snooze'),
      ...target,
      minutes: z.union([z.literal(15), z.literal(60), z.literal(480), z.literal(1440)]),
    })
    .strict(),
  z.object({ action: z.literal('review'), ...target }).strict(),
  z.object({ action: z.literal('restore'), ...target }).strict(),
]);
export type NotificationInput = z.infer<typeof notificationInputSchema>;
export function defaultNotifications(): NotificationRecord {
  return {
    revision: null,
    states: [],
    config: {
      schemaVersion: 1,
      features: {
        assets: { enabled: true, cooldownMinutes: 0 },
        supply: { enabled: true, cooldownMinutes: 0 },
        market: { enabled: true, cooldownMinutes: 0 },
        operations: { enabled: true, cooldownMinutes: 0 },
        events: { enabled: true, cooldownMinutes: 0 },
        maintenance: { enabled: true, cooldownMinutes: 0 },
        assistance: { enabled: true, cooldownMinutes: 0 },
      },
      quiet: { enabled: false, start: '22:00', end: '07:00', timeZone: 'UTC' },
    },
  };
}
export function quietNow(config: NotificationConfig, now: number): boolean {
  if (!config.quiet.enabled) return false;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.quiet.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const local = `${parts.find((p) => p.type === 'hour')!.value}:${parts.find((p) => p.type === 'minute')!.value}`;
  const { start, end } = config.quiet;
  return start < end ? local >= start && local < end : local >= start || local < end;
}
export function mutedReason(alert: InboxAlert, record: NotificationRecord, now: number): string | null {
  if (!record.config.features[alert.category].enabled) return 'Category disabled';
  if (quietNow(record.config, now)) return 'Quiet hours';
  const state = record.states.find((entry) => entry.id === alert.id);
  if (!state) return null;
  if (state.dismissed && state.dismissed === alert.fingerprint) return 'Dismissed';
  if (state.snoozedUntil && Date.parse(state.snoozedUntil) > now) return `Snoozed until ${state.snoozedUntil}`;
  const until = state.seenAt
    ? Date.parse(state.seenAt) + record.config.features[alert.category].cooldownMinutes * 60000
    : 0;
  return until > now ? `Cooldown until ${new Date(until).toISOString()}` : null;
}
