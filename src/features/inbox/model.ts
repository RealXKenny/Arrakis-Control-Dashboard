import { z } from 'zod';
import type { PortalProfile } from '../portal/view-model';
import type { StoredOperation } from '../guilds/operations';
import type { StoredResourceRequest } from '../guilds/resource-requests';
import type { CommunityEvent } from '../events/contracts';
import type { EventRegistrationSummary } from '../events/registrations';
import type { RestartEntry } from '../monitoring/restart-queue';
import { assistanceAlerts } from '../assistance/model';

export { assistanceAlerts };
export const inboxCategories = [
  'assets',
  'supply',
  'market',
  'operations',
  'events',
  'maintenance',
  'assistance',
] as const;
export type InboxCategory = (typeof inboxCategories)[number];
export const categoryNames: Record<InboxCategory, string> = {
  assets: 'Assets',
  supply: 'Supply',
  market: 'Market',
  operations: 'Operations',
  events: 'Events',
  maintenance: 'Maintenance',
  assistance: 'Assistance',
};
export const inboxAlertSchema = z
  .object({
    id: z.string().min(1).max(300),
    fingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    category: z.enum(inboxCategories),
    priority: z.enum(['attention', 'urgent']),
    title: z.string().min(1).max(240),
    detail: z.string().max(600),
    action: z.string().max(80),
    href: z.string().regex(/^\/(?:holdings|vehicles|guild|calendar|status|events|help)(?:[?#][a-zA-Z0-9_%=&#.~-]*)?$/),
  })
  .strict();
export type InboxAlert = z.infer<typeof inboxAlertSchema>;
export const inboxViewSchema = z
  .object({
    checkedAt: z.iso.datetime(),
    alerts: z.array(inboxAlertSchema).max(120),
    sources: z
      .array(
        z
          .object({
            category: z.enum(inboxCategories),
            status: z.enum(['checked', 'partial', 'unavailable', 'unlinked', 'not-applicable', 'unsupported']),
            detail: z.string().max(600),
            readAt: z.iso.datetime().nullable().default(null),
            context: z
              .string()
              .regex(/^[a-f0-9]{64}$/)
              .nullable()
              .default(null),
          })
          .strict(),
      )
      .length(inboxCategories.length),
  })
  .strict();
export type InboxView = z.infer<typeof inboxViewSchema>;
const anchorId = (value: string) =>
  encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16)}`);
function reportedCollection(value: unknown, depth = 0): boolean {
  if (Array.isArray(value)) return true;
  if (!value || typeof value !== 'object' || depth >= 3) return false;
  const row = value as Record<string, unknown>;
  return ['rows', 'data', 'bases', 'vehicles', 'results', 'items'].some((key) =>
    reportedCollection(row[key], depth + 1),
  );
}

/** Only reported percentages produce alerts. Generator defaults are deliberately not evidence. */
export function assetAlerts(profile: PortalProfile): { alerts: InboxAlert[]; partial: boolean } {
  const alerts: InboxAlert[] = [];
  let partial =
    profile.bases.length > 20 ||
    profile.vehicles.length > 20 ||
    !reportedCollection(profile.details.bases) ||
    !reportedCollection(profile.details.vehicles);
  const known = (value: number | null | undefined): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
  for (const base of profile.bases.slice(0, 20)) {
    const href = `/holdings${base.owned ? '' : '?view=shared'}#base-${anchorId(base.id)}`;
    for (const [kind, value, trigger, detail] of [
      ['water', base.water.percent, 'low', 'Water is at or below 10% of reported capacity.'],
      ['storage', base.storage.percent, 'high', 'Storage is at or above 90% of reported capacity.'],
    ] as const) {
      if (!known(value)) {
        partial = true;
        continue;
      }
      if (trigger === 'low' ? value > 10 : value < 90) continue;
      alerts.push({
        id: `base:${base.id}:${kind}`,
        category: 'assets',
        priority: value === 0 ? 'urgent' : 'attention',
        title: `${base.name.slice(0, 180)}: ${kind === 'water' ? 'check water' : 'review storage'}`,
        detail: `${detail} Last reported: ${Math.round(value)}%.`,
        href,
        action: 'Inspect base',
      });
    }
  }
  for (const vehicle of profile.vehicles.slice(0, 20)) {
    for (const [kind, value, threshold] of [
      ['condition', vehicle.condition, 20],
      ['fuel', vehicle.fuel?.percent, 10],
    ] as const) {
      if (kind === 'fuel' && vehicle.fuel === null) continue;
      if (!known(value)) {
        partial = true;
        continue;
      }
      if (value > threshold) continue;
      alerts.push({
        id: `vehicle:${vehicle.id}:${kind}`,
        category: 'assets',
        priority: value === 0 ? 'urgent' : 'attention',
        title: `${vehicle.name.slice(0, 180)}: check ${kind}`,
        detail: `${kind === 'fuel' ? 'Fuel' : 'Condition'} is at or below ${threshold}% (reported ${Math.round(value)}%).`,
        href: `/vehicles${vehicle.access === 'shared' ? '?view=shared' : ''}#vehicle-${anchorId(vehicle.id)}`,
        action: 'Inspect vehicle',
      });
    }
  }
  return { alerts, partial };
}

export function supplyAlerts(requests: StoredResourceRequest[], memberId: string, canEdit: boolean): InboxAlert[] {
  return requests
    .filter((r) => r.status === 'open')
    .flatMap((r): InboxAlert[] => {
      const review =
        (r.requesterId === memberId || canEdit) &&
        r.pledges.some((p) => p.status === 'reported' && p.supplierId !== memberId);
      const promised = r.pledges.some((p) => p.supplierId === memberId && p.status === 'promised');
      if (!review && !promised && r.priority !== 'urgent') return [];
      return [
        {
          id: `supply:${r.id}`,
          category: 'supply',
          priority: r.priority === 'urgent' ? 'urgent' : 'attention',
          title: `${r.material}: ${review ? 'review reported delivery' : promised ? 'your pledge needs follow-up' : 'urgent supply request'}`,
          detail: review
            ? 'A supplier reports a delivery. Check it before confirming receipt.'
            : promised
              ? 'You have an outstanding promise. Open the request to coordinate or report delivery.'
              : 'Your guild has requested help. Check the remaining quantity before pledging.',
          href: '/guild?tab=resources',
          action: 'Open supply requests',
        },
      ];
    });
}

export function operationAlerts(operations: StoredOperation[], memberId: string, now: number): InboxAlert[] {
  return operations
    .filter((o) => o.status === 'scheduled' && Date.parse(o.endsAt) > now && Date.parse(o.startsAt) <= now + 86400000)
    .map((o) => ({
      id: `operation:${o.id}`,
      category: 'operations' as const,
      priority: Date.parse(o.startsAt) <= now + 3600000 ? ('urgent' as const) : ('attention' as const),
      title: o.title,
      detail: `${o.signups.some((s) => s.memberId === memberId) ? 'You are signed up.' : 'Guild briefing available.'} Starts ${o.startsAt}; ends ${o.endsAt}.`,
      href: '/guild?tab=operations',
      action: 'Read operation briefing',
    }));
}

export function eventAlerts(
  events: CommunityEvent[],
  now: number,
  registrations: Record<string, EventRegistrationSummary | null> = {},
): InboxAlert[] {
  return events
    .filter((event) => {
      if (!event.startsAt || !['upcoming', 'open'].includes(event.status)) return false;
      const starts = Date.parse(event.startsAt);
      const ends = event.endsAt ? Date.parse(event.endsAt) : starts + 1;
      return starts <= now + 7 * 86_400_000 && ends > now;
    })
    .map((event) => {
      const registration = registrations[event.id];
      const own = registration?.ownStatus
        ? ` ${registration.ownStatus === 'registered' ? 'You are registered.' : `You are on the waiting list at position ${registration.ownWaitlistPosition}.`}`
        : '';
      return {
        id: `event:${event.id}`,
        category: 'events' as const,
        priority: Date.parse(event.startsAt!) <= now + 3_600_000 ? ('urgent' as const) : ('attention' as const),
        title: event.title,
        detail: `Published community event. Starts ${event.startsAt}.${own}`,
        href: '/calendar' as const,
        action: 'Open community calendar',
      };
    });
}

export function maintenanceAlerts(entries: RestartEntry[], now: number): InboxAlert[] {
  return entries
    .filter(
      (entry) =>
        entry.status === 'restarting' || (entry.restartAt >= now - 300_000 && entry.restartAt <= now + 86_400_000),
    )
    .map((entry) => ({
      id: `maintenance:${entry.id}`,
      category: 'maintenance',
      priority:
        entry.status === 'restarting' || entry.restartAt <= now + 3_600_000
          ? ('urgent' as const)
          : ('attention' as const),
      title: entry.target === 'battlegroup' ? 'All servers restart' : `${entry.mapLabel} restart`,
      detail: `Confirmed active Console queue. Active play may be interrupted. Scheduled for ${new Date(entry.restartAt).toISOString()}.`,
      href: '/status',
      action: 'Review restart status',
    }));
}
