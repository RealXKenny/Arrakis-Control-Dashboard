import type { Metadata } from 'next';
import Image from 'next/image';
import { factionEmblem } from '../../../features/guilds/details';
import { groupMembersByRank } from '../../../features/guilds/members';
import { guildRoleLabel } from '../../../features/portal/guild';
import { loadMyGuild } from '../../../server/guilds';
import { loadPortalProfile } from '../../../server/portal';
import { requireSession } from '../../../server/session';
import { ProfileFailure } from '../_components/gauge-notice';
import { Notice, PageHeader } from '../_components/page-header';
import { SegmentedNav } from '../_components/segmented-nav';
import { ApplicationInbox } from './_components/application-inbox';
import { DisbandPanel } from './_components/management';
import { GuildEmblem } from './_components/logo-uploader';
import { Roster } from './_components/roster';
import { SettingsForm } from './_components/settings-form';
import { SupportPanel } from './_components/support-panel';

export const metadata: Metadata = { title: 'My guild' };

export default async function MyGuildPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const { tab: requested } = await searchParams;
  const profile = await loadPortalProfile(session);

  if (profile.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Your community" title="My guild" />
        <ProfileFailure result={profile} />
      </>
    );
  }

  const result = await loadMyGuild(session, profile.profile.legacyCharacter);

  if (result.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Your community" title="My guild" />
        {result.status === 'none' && (
          <Notice title="No guild reported">
            The server returned no membership for your character. Refresh after joining a guild in game, or browse the
            recruiting guilds.
          </Notice>
        )}
        {result.status === 'limited' && (
          <Notice tone="warn" title="Slow down, traveller">
            Too many reads from your connection. Try again in {result.retryAfter} seconds.
          </Notice>
        )}
        {result.status === 'unavailable' && (
          <Notice tone="warn" title="Guild unavailable">
            {result.message}
          </Notice>
        )}
      </>
    );
  }

  const { guild, members, self, canEdit, leaderCheck, requirement } = result;
  const tab = canEdit && (Array.isArray(requested) ? requested[0] : requested) === 'settings' ? 'settings' : 'roster';
  const groups = groupMembersByRank(members);
  const leader = members.find((member) => member.roleId === 100);
  const emblem = factionEmblem(guild.faction);

  return (
    <>
      <PageHeader eyebrow="Your community" title="My guild" />

      {canEdit && (
        <SegmentedNav
          label="Guild sections"
          active={tab}
          items={[
            { id: 'roster', label: 'My Guild', href: '/guild' },
            { id: 'settings', label: 'Settings', href: '/guild?tab=settings' },
          ]}
        />
      )}
      {!leaderCheck && (
        <div className="mb-6">
          <Notice tone="warn" title="Leader controls hidden">
            Your linked character could not be verified right now, so guild management is unavailable. Refresh to try
            again.
          </Notice>
        </div>
      )}

      {tab === 'roster' ? (
        <div className="flex flex-col gap-8">
          <section aria-label="Guild membership" className="panel flex flex-col gap-6 p-6 sm:flex-row sm:items-start">
            <GuildEmblem guildId={guild.id} guildName={guild.name} editable={canEdit} />
            <div className="min-w-0 flex-1">
              <h2 className="text-2xl">{guild.name}</h2>
              <p className="mt-2 font-mono text-xs uppercase tracking-widest text-sand-400">
                {self ? `Your rank: ${guildRoleLabel(self.roleId)}` : 'Your rank: Not reported'}
                {leader && <span className="ml-4">Guild owner: {leader.name}</span>}
              </p>
              {guild.description && (
                <p className="mt-4 max-w-prose whitespace-pre-wrap text-sm text-sand-300">{guild.description}</p>
              )}
              <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-600">Faction</dt>
                  <dd className="mt-1 flex items-center gap-2 text-sm font-semibold text-sand-100">
                    {emblem && <Image src={emblem} alt="" aria-hidden="true" width={24} height={24} />}
                    {guild.faction}
                  </dd>
                </div>
                <div>
                  <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-600">Members</dt>
                  <dd className="mt-1 text-sm font-semibold text-spice-300">
                    {(guild.memberCount ?? members.length).toLocaleString('en-US')}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <Roster guildId={guild.id} guildName={guild.name} groups={groups} canEdit={canEdit} />
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <SettingsForm
            key={guild.id}
            guildId={guild.id}
            initial={requirement ?? { guildName: guild.name, requirements: '', contact: '', published: false }}
          />
          <ApplicationInbox guildId={guild.id} />
          <SupportPanel guildId={guild.id} />
          <DisbandPanel guildId={guild.id} guildName={guild.name} />
        </div>
      )}
    </>
  );
}
