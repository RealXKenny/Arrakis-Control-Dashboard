import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { resourceGuildIdSchema, resourceInputSchema, resourceRequestsView } from '../resource-requests';
import { requireGuildMember } from './member-access';
import { mutateResourceRequest, readResourceRequests } from './resource-requests-store';

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = resourceGuildIdSchema.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:resources:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 30 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Resource requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'RESOURCES_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'RESOURCES_LIMITED', true);
  const member = await requireGuildMember(session, parsed.data);
  if (!member.memberId)
    throw new AppError('Your guild member ID could not be verified.', 503, 'GUILD_VERIFICATION_UNAVAILABLE', true);
  return { session, guildId: parsed.data, ...member };
}
export async function getGuildResourceRequests(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({
    ok: true,
    data: resourceRequestsView(await readResourceRequests(access.guildId), access.memberId, access.canEdit),
  });
}
export async function mutateGuildResourceRequests(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 16_384);
  if (!bytes) throw new AppError('Resource details are too large.', 413, 'RESOURCES_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid resource details.', 400, 'INVALID_RESOURCE_REQUEST', true);
  }
  const input = resourceInputSchema.safeParse(raw);
  if (!input.success)
    throw new AppError('Check the resource fields and whole-number quantities.', 400, 'INVALID_RESOURCE_REQUEST', true);
  const saved = await mutateResourceRequest(access.guildId, input.data, access);
  void recordAudit({
    event: 'guild.resource_request_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: {
      guildId: access.guildId,
      requestId: input.data.action === 'save' ? input.data.request.id : input.data.id,
      action: input.data.action,
    },
  });
  return json({
    ok: true,
    data: { request: saved ? resourceRequestsView([saved], access.memberId, access.canEdit).requests[0] : null },
  });
}
