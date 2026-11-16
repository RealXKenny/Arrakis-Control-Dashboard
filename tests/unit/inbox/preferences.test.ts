import { expect, it } from 'vitest';
import {
  defaultNotifications,
  notificationConfigSchema,
  notificationInputSchema,
  quietNow,
  mutedReason,
} from '../../../src/features/inbox/preferences';
import type { InboxAlert } from '../../../src/features/inbox/model';
const alert: InboxAlert = {
  id: 'a'.repeat(64),
  fingerprint: 'b'.repeat(64),
  category: 'assets',
  title: 'Water low',
  detail: '',
  action: 'Inspect base',
  href: '/holdings',
  priority: 'urgent',
};
it('validates strict feature preferences, timezone, minute bounds and distinct quiet windows', () => {
  const p = defaultNotifications();
  expect(notificationConfigSchema.safeParse(p.config).success).toBe(true);
  for (const config of [
    { ...p.config, owner: 'other' },
    { ...p.config, features: { ...p.config.features, assets: { enabled: true, cooldownMinutes: 10081 } } },
    { ...p.config, quiet: { ...p.config.quiet, timeZone: 'Invalid/Zone' } },
    { ...p.config, quiet: { ...p.config.quiet, enabled: true, start: '07:00', end: '07:00' } },
  ])
    expect(notificationConfigSchema.safeParse(config).success).toBe(false);
  expect(
    notificationInputSchema.safeParse({ action: 'snooze', revision: null, id: alert.id, minutes: 999999 }).success,
  ).toBe(false);
  expect(
    notificationInputSchema.safeParse({
      action: 'review',
      revision: null,
      id: alert.id,
      seenAt: new Date().toISOString(),
    }).success,
  ).toBe(false);
});
it('handles inclusive start/exclusive end and midnight in the selected timezone', () => {
  const config = defaultNotifications().config;
  config.quiet = { enabled: true, start: '22:00', end: '07:00', timeZone: 'America/New_York' };
  expect(quietNow(config, Date.parse('2026-11-15T03:00:00Z'))).toBe(true);
  expect(quietNow(config, Date.parse('2026-11-15T11:59:59Z'))).toBe(true);
  expect(quietNow(config, Date.parse('2026-11-15T12:00:00Z'))).toBe(false);
  expect(quietNow(config, Date.parse('2026-11-15T17:00:00Z'))).toBe(false);
  config.quiet.start = '10:00';
  config.quiet.end = '12:00';
  expect(quietNow(config, Date.parse('2026-11-15T15:00:00Z'))).toBe(true);
  expect(quietNow(config, Date.parse('2026-11-15T17:00:00Z'))).toBe(false);
});
it('follows daylight-saving transitions without double-delivering or shifting the timezone', () => {
  const config = defaultNotifications().config;
  config.quiet = { enabled: true, start: '01:00', end: '02:00', timeZone: 'America/New_York' };
  expect(quietNow(config, Date.parse('2026-11-01T05:30:00Z'))).toBe(true);
  expect(quietNow(config, Date.parse('2026-11-01T06:30:00Z'))).toBe(true);
  expect(quietNow(config, Date.parse('2026-11-01T07:00:00Z'))).toBe(false);
});
it('keeps dismissed versions, snooze deadlines and per-alert cooldowns distinct, including urgent alerts', () => {
  const p = defaultNotifications();
  const now = Date.parse('2026-11-15T12:00:00Z');
  p.states = [
    {
      id: alert.id,
      dismissed: alert.fingerprint!,
      snoozedUntil: null,
      seenAt: null,
      updatedAt: new Date(now).toISOString(),
    },
  ];
  expect(mutedReason(alert, p, now)).toBe('Dismissed');
  expect(mutedReason({ ...alert, fingerprint: 'c'.repeat(64) }, p, now)).toBeNull();
  p.states[0].dismissed = null;
  p.states[0].snoozedUntil = new Date(now + 60000).toISOString();
  expect(mutedReason(alert, p, now)).toContain('Snoozed');
  expect(mutedReason(alert, p, now + 60000)).toBeNull();
  p.states[0].snoozedUntil = null;
  p.states[0].seenAt = new Date(now).toISOString();
  p.config.features.assets.cooldownMinutes = 60;
  expect(mutedReason(alert, p, now)).toContain('Cooldown');
  expect(mutedReason(alert, p, now + 3600000)).toBeNull();
  expect(mutedReason({ ...alert, id: 'd'.repeat(64) }, p, now)).toBeNull();
  p.config.features.assets.enabled = false;
  expect(mutedReason(alert, p, now)).toBe('Category disabled');
});

it('upgrades existing preference records with enabled event and maintenance defaults', () => {
  const config = defaultNotifications().config;
  const { events: _events, maintenance: _maintenance, ...legacyFeatures } = config.features;
  const parsed = notificationConfigSchema.parse({ ...config, features: legacyFeatures });
  expect(parsed.features.events).toEqual({ enabled: true, cooldownMinutes: 0 });
  expect(parsed.features.maintenance).toEqual({ enabled: true, cooldownMinutes: 0 });
});
