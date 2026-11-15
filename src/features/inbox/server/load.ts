import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import type { DashboardSession } from '../../auth/server/session-store';
import { loadPortalProfile } from '../../portal/server/load';
import { reportedGuild } from '../../guilds/details';
import { requireGuildMember } from '../../guilds/server/member-access';
import { readGuildOperations } from '../../guilds/server/operations-store';
import { readResourceRequests } from '../../guilds/server/resource-requests-store';
import { assetAlerts, supplyAlerts, operationAlerts, inboxViewSchema, type InboxView } from '../model';

/** Read-through inbox: no private guild snapshots survive a membership or character change. */
export async function loadInbox(session: DashboardSession): Promise<InboxView> {
  const sources: InboxView['sources'] = [
    { category: 'assets', status: 'unavailable', detail: 'Asset readings could not be checked.' },
    { category: 'supply', status: 'unavailable', detail: 'Guild membership could not be checked.' },
    {
      category: 'market',
      status: 'unsupported',
      detail:
        'Personal market-price alerts are not available yet. Browse current listings to check prices; listings do not confirm a sale.',
    },
    { category: 'operations', status: 'unavailable', detail: 'Guild membership could not be checked.' },
  ];
  let alerts: InboxView['alerts'] = [];
  const result = await loadPortalProfile(session);
  if (result.status === 'ok') {
    const assets = assetAlerts(result.profile);
    alerts = assets.alerts;
    sources[0] = {
      category: 'assets',
      status: assets.partial ? 'partial' : 'checked',
      detail: assets.partial
        ? 'Reported water, storage, condition and fuel only. Some readings are missing or exceed the 20-base/20-vehicle limit.'
        : 'Reported water, storage, vehicle condition and fuel checked. Generator maintenance monitoring is not available yet.',
    };
    const guild = reportedGuild(result.profile.legacyCharacter);
    if (!result.profile.character.guild) {
      for (const index of [1, 3])
        sources[index] = {
          ...sources[index],
          status: 'not-applicable',
          detail:
            index === 1
              ? 'No game guild is reported. Personal stockpile monitoring is not available yet.'
              : 'No game guild is reported. Operation briefings require current guild membership.',
        };
    } else if (guild) {
      try {
        const member = await requireGuildMember(session, guild.id);
        if (!member.memberId) throw new Error('Unverified member');
        const results = await Promise.allSettled([readResourceRequests(guild.id), readGuildOperations(guild.id)]);
        const [supply, operations] = results;
        if (supply.status === 'fulfilled') {
          alerts.push(...supplyAlerts(supply.value, member.memberId, member.canEdit));
          sources[1] = {
            category: 'supply',
            status: 'checked',
            detail:
              'Open guild requests: urgent needs, your promises and deliveries you can review. Personal stockpile monitoring is not available yet.',
          };
        } else sources[1].detail = 'Supply storage is unavailable. No supply requests were exposed.';
        if (operations.status === 'fulfilled') {
          alerts.push(...operationAlerts(operations.value, member.memberId, Date.now()));
          sources[3] = {
            category: 'operations',
            status: 'checked',
            detail: 'Scheduled guild operations starting within 24 hours, including runs already in progress.',
          };
        } else sources[3].detail = 'Operation storage is unavailable. No operation details were exposed.';
      } catch {
        // Dev note: a familiar guild name is not a backstage pass.
        for (const index of [1, 3])
          sources[index].detail = 'Current guild membership could not be verified. Private alerts are hidden.';
      }
    }
  } else if (result.status === 'unlinked') {
    for (const index of [0, 1, 3])
      sources[index] = {
        ...sources[index],
        status: 'unlinked',
        detail: 'Link a character through the Discord bot to check this source.',
      };
  }
  // Opaque response IDs never expose raw asset, member, controller or pawn identifiers.
  const seen = new Set<string>();
  alerts = alerts
    .map((alert) => ({ ...alert, id: createHash('sha256').update(`${session.user.id}\0${alert.id}`).digest('hex') }))
    .filter((alert) => {
      if (seen.has(alert.id)) return false;
      seen.add(alert.id);
      return true;
    })
    .sort(
      (a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent') || a.title.localeCompare(b.title),
    );
  return inboxViewSchema.parse({ checkedAt: new Date().toISOString(), alerts, sources });
}
