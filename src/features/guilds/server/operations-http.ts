import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { operationGuildIdSchema, operationInputSchema, operationsView } from '../operations';
import { requireGuildMember } from './member-access';
import { mutateGuildOperation, readGuildOperations } from './operations-store';

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = operationGuildIdSchema.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:operations:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 30 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Operation requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'OPERATIONS_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'OPERATIONS_LIMITED', true);
  const member = await requireGuildMember(session, parsed.data);
  if (!member.memberId)
    throw new AppError('Your guild member ID could not be verified.', 503, 'GUILD_VERIFICATION_UNAVAILABLE', true);
  return { session, guildId: parsed.data, ...member };
}
export async function getGuildOperations(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({
    ok: true,
    data: operationsView(await readGuildOperations(access.guildId), access.memberId, access.canEdit),
  });
}
export async function mutateGuildOperations(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 16_384);
  if (!bytes) throw new AppError('Operation details are too large.', 413, 'OPERATIONS_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid operation details.', 400, 'INVALID_OPERATION', true);
  }
  const parsed = operationInputSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError('Check the operation fields, dates and role capacities.', 400, 'INVALID_OPERATION', true);
  if (!['join', 'leave'].includes(parsed.data.action) && !access.canEdit)
    throw new AppError('Only the guild leader can manage operations.', 403, 'GUILD_LEADER_REQUIRED', true);
  const operation = await mutateGuildOperation(access.guildId, parsed.data, access);
  void recordAudit({
    event: 'guild.operation_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: {
      guildId: access.guildId,
      operationId: parsed.data.action === 'save' ? parsed.data.operation.id : parsed.data.id,
      action: parsed.data.action,
    },
  });
  return json({
    ok: true,
    data: { operation: operation ? operationsView([operation], access.memberId, access.canEdit).operations[0] : null },
  });
}
