import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { directoryGuildIdSchema, baseDirectoryInputSchema } from '../base-directory';
import { requireGuildMember } from './member-access';
import { readBaseDirectory, mutateBaseDirectory } from './base-directory-store';

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = directoryGuildIdSchema.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:base-directory:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 20 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Directory requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'BASE_DIRECTORY_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'BASE_DIRECTORY_LIMITED', true);
  const member = await requireGuildMember(session, parsed.data);
  if (write && !member.canEdit)
    throw new AppError('Only the guild leader can manage the base directory.', 403, 'GUILD_LEADER_REQUIRED', true);
  return { session, guildId: parsed.data, ...member };
}
export async function getGuildBaseDirectory(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({ ok: true, data: { canEdit: access.canEdit, entries: await readBaseDirectory(access.guildId) } });
}
export async function mutateGuildBaseDirectory(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 16_384);
  if (!bytes) throw new AppError('Directory details are too large.', 413, 'BASE_DIRECTORY_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid directory details.', 400, 'INVALID_BASE_DIRECTORY', true);
  }
  const input = baseDirectoryInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Check the listing fields and length limits.', 400, 'INVALID_BASE_DIRECTORY', true);
  const entry = await mutateBaseDirectory(access.guildId, input.data, access);
  void recordAudit({
    event: 'guild.base_directory_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: {
      guildId: access.guildId,
      entryId: input.data.action === 'save' ? input.data.entry.id : input.data.id,
      action: input.data.action,
    },
  });
  return json({ ok: true, data: { entry } });
}
