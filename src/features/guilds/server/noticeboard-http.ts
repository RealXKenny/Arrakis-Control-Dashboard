import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { spendReadBudget } from '../../../server/read-budget';
import { noticeboardGuildId, noticeboardInputSchema } from '../noticeboard';
import { requireGuildMember } from './member-access';
import { readNoticeboard, saveNoticeboard } from './noticeboard-store';

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = noticeboardGuildId.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:noticeboard:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 20 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Noticeboard requests are temporarily limited. Try again shortly.',
      limit.storageUnavailable ? 503 : 429,
      'NOTICEBOARD_LIMITED',
      true,
    );
  const budget = await spendReadBudget();
  if (!budget.allowed)
    throw new AppError(
      'Guild verification is temporarily limited. Try again shortly.',
      429,
      'NOTICEBOARD_LIMITED',
      true,
    );
  const membership = await requireGuildMember(session, parsed.data);
  if (write && !membership.canEdit)
    throw new AppError('Only the guild leader can manage announcements.', 403, 'GUILD_LEADER_REQUIRED', true);
  return { session, guildId: parsed.data, ...membership };
}
export async function getGuildNoticeboard(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({ ok: true, data: { board: await readNoticeboard(access.guildId), canEdit: access.canEdit } });
}
export async function mutateGuildNoticeboard(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 16_384);
  if (!bytes) throw new AppError('Announcement details are too large.', 413, 'NOTICEBOARD_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid announcement details.', 400, 'INVALID_NOTICEBOARD', true);
  }
  const parsed = noticeboardInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError('Check the announcement fields and length limits.', 400, 'INVALID_NOTICEBOARD', true);
  const board = await saveNoticeboard(access.guildId, parsed.data, access.authorName);
  void recordAudit({
    event: 'guild.noticeboard_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: { guildId: access.guildId, action: parsed.data.action },
  });
  return json({ ok: true, data: { board, canEdit: true } });
}
