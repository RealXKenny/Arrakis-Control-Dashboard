import '../../../lib/assert-server';
import { createHash } from 'node:crypto';
import { AppError } from '../../../lib/errors';
import { guildMemberId, guildMemberName, guildMemberRole } from '../member-identity';
import { onboardingGuildId } from '../onboarding';

export function onboardingKey(guildId: string, memberId: string) {
  return createHash('sha256')
    .update(JSON.stringify([onboardingGuildId.parse(guildId), onboardingGuildId.parse(memberId)]))
    .digest('hex');
}
export function onboardingActor(
  guildId: string,
  access: { memberId: string | null; canEdit: boolean; roster: Record<string, unknown>[] },
) {
  if (!access.memberId || access.roster.length > 500)
    throw new AppError('The current guild roster could not be verified.', 503, 'ONBOARDING_UNAVAILABLE', true);
  const roster = [
    ...new Map(
      access.roster.flatMap((row) => {
        const id = guildMemberId(row);
        return id && guildMemberRole(row) !== null
          ? [[onboardingKey(guildId, id), { key: onboardingKey(guildId, id), name: guildMemberName(row) }] as const]
          : [];
      }),
    ).values(),
  ];
  const memberKey = onboardingKey(guildId, access.memberId);
  if (!roster.some((member) => member.key === memberKey))
    throw new AppError('Only current members can access onboarding.', 403, 'GUILD_MEMBER_REQUIRED', true);
  return { memberKey, canEdit: access.canEdit, roster };
}
export type OnboardingActor = ReturnType<typeof onboardingActor>;
