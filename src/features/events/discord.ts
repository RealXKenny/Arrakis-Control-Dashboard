import { discordContainer, discordPageButton } from '../../lib/discord-components';
import { EVENT_STATUS_LABELS, type CommunityEvent } from './contracts';

export function buildEventAnnouncement(event: CommunityEvent, appUrl?: string) {
  const date = (value: string) => `<t:${Math.floor(Date.parse(value) / 1000)}:f>`;
  const schedule =
    [event.startsAt ? `Starts ${date(event.startsAt)}` : '', event.endsAt ? `Ends ${date(event.endsAt)}` : '']
      .filter(Boolean)
      .join(' · ') || 'Schedule to be announced';
  return discordContainer(
    [
      `# ${event.title}`,
      `**Community event · ${EVENT_STATUS_LABELS[event.status]}**`,
      event.summary,
      `## Prizes\n${[event.prizeSolaris ? `**${event.prizeSolaris.toLocaleString('en-US')} Solaris coins**` : '', event.prizeItems].filter(Boolean).join('\n') || 'Prizes to be announced.'}`,
      `**Schedule**\n${schedule}`,
      `**How to enter**\n${event.participation || 'Entry details will be announced on the dashboard.'}`,
      'Full details and competition rules are available on Community events.',
    ],
    discordPageButton('View community event', appUrl, `/events#${event.id}`),
  );
}
