import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { pollGuildId, pollInputSchema } from '../polls';
import { requireGuildMember } from './member-access';
import { readGuildPolls, mutateGuildPoll, guildPollView } from './polls-store';

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const guild = pollGuildId.safeParse((await ctx.params).guildId);
  if (!guild.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:polls:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 30 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Poll requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'POLLS_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'POLLS_LIMITED', true);
  const member = await requireGuildMember(session, guild.data);
  if (!member.memberId)
    throw new AppError('Your character could not be verified.', 503, 'GUILD_VERIFICATION_UNAVAILABLE', true);
  return { session, guildId: guild.data, ...member, memberId: member.memberId };
}
export async function getGuildPolls(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({
    ok: true,
    data: {
      canEdit: access.canEdit,
      polls: (await readGuildPolls(access.guildId)).map((poll) => guildPollView(poll, access.memberId)),
    },
  });
}
export async function mutateGuildPolls(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 16_384);
  if (!bytes) throw new AppError('Poll details are too large.', 413, 'POLL_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid poll details.', 400, 'INVALID_POLL', true);
  }
  const input = pollInputSchema.safeParse(raw);
  if (!input.success) throw new AppError('Check the poll fields and limits.', 400, 'INVALID_POLL', true);
  const poll = await mutateGuildPoll(access.guildId, input.data, access);
  void recordAudit({
    event: 'guild.poll_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: {
      guildId: access.guildId,
      pollId: input.data.action === 'create' ? input.data.poll.id : input.data.id,
      action: input.data.action,
    },
  });
  return json({ ok: true, data: { poll: poll ? guildPollView(poll, access.memberId) : null } });
}
