import '../../../lib/assert-server';
import type { DashboardSession } from '../../auth/server/session-store';
import { listCommunityEvents } from '../../events/server/store';
import { getEventRegistration } from '../../events/server/registrations-store';
import { loadPortalProfile } from '../../portal/server/load';
import { reportedGuild } from '../../guilds/details';
import { requireGuildMember } from '../../guilds/server/member-access';
import { readGuildOperations } from '../../guilds/server/operations-store';
import { readRestartQueue } from '../../monitoring/server/restart-queue';
import type { CalendarData, CalendarItem } from '../model';

async function commitments(
  session: DashboardSession,
): Promise<{ items: CalendarItem[]; state: CalendarData['operationsState'] }> {
  const profile = await loadPortalProfile(session);
  if (profile.status !== 'ok') return { items: [], state: 'unavailable' };
  if (!profile.profile.character.guild) return { items: [], state: 'not-applicable' };
  const guild = reportedGuild(profile.profile.legacyCharacter);
  if (!guild) return { items: [], state: 'unavailable' };
  const member = await requireGuildMember(session, guild.id);
  if (!member.memberId) return { items: [], state: 'unavailable' };
  const operations = await readGuildOperations(guild.id);
  return {
    state: 'available',
    items: operations
      .filter((operation) => operation.signups.some((signup) => signup.memberId === member.memberId))
      .map((operation) => ({
        id: `operation:${operation.id}`,
        category: 'operation',
        title: operation.title,
        description: operation.details,
        startsAt: operation.startsAt,
        endsAt: operation.endsAt,
        state: operation.status === 'cancelled' ? 'cancelled' : 'confirmed',
        href: '/guild?tab=operations',
      })),
  };
}

/** Sources remain independent so an unavailable private source is never mistaken for an empty calendar. */
export async function loadCalendar(session: DashboardSession): Promise<CalendarData> {
  const [events, operations, maintenance] = await Promise.allSettled([
    listCommunityEvents(),
    commitments(session),
    Promise.resolve().then(() => readRestartQueue()),
  ]);
  const scheduledEvents = events.status === 'fulfilled' ? events.value.filter((event) => event.startsAt) : [];
  const registrations = await Promise.all(
    scheduledEvents.map((event) => getEventRegistration(event, session.user.id).catch(() => null)),
  );
  const eventItems: CalendarItem[] = scheduledEvents.map((event, index) => {
    const registration = registrations[index];
    const ownStatus = registration?.ownStatus
      ? `Your registration: ${registration.ownStatus === 'waiting' ? `waiting list, position ${registration.ownWaitlistPosition}` : 'registered'}.`
      : '';
    return {
      id: `event:${event.id}`,
      category: 'event',
      title: event.title,
      description: [event.summary, ownStatus].filter(Boolean).join('\n'),
      startsAt: event.startsAt!,
      endsAt: event.endsAt,
      state: event.status === 'cancelled' ? 'cancelled' : 'unspecified',
      href: '/events',
    };
  });
  const maintenanceItems: CalendarItem[] =
    maintenance.status === 'fulfilled'
      ? maintenance.value.entries
          .filter((entry) => entry.status === 'counting')
          .map((entry) => ({
            id: `maintenance:${entry.id}`,
            category: 'maintenance',
            title: entry.target === 'battlegroup' ? 'All servers restart' : `${entry.mapLabel} restart`,
            description: 'Active Console restart queue. Play may be interrupted.',
            startsAt: new Date(entry.restartAt).toISOString(),
            endsAt: null,
            state: 'confirmed',
            href: '/status',
          }))
      : [];
  const seen = new Set<string>();
  const items = [
    ...eventItems,
    ...(operations.status === 'fulfilled' ? operations.value.items : []),
    ...maintenanceItems,
  ]
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  return {
    items,
    eventsAvailable: events.status === 'fulfilled',
    operationsState: operations.status === 'fulfilled' ? operations.value.state : 'unavailable',
    maintenanceAvailable: maintenance.status === 'fulfilled',
    maintenanceObservedAt:
      maintenance.status === 'fulfilled' ? new Date(maintenance.value.observedAt).toISOString() : null,
    unscheduledEvents: events.status === 'fulfilled' ? events.value.filter((event) => !event.startsAt).length : 0,
    registrationUnavailable: registrations.filter((value) => value === null).length,
  };
}
