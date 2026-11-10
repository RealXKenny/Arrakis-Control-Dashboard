import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { spendReadBudget } from '../../../server/read-budget';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { onboardingGuildId, onboardingInputSchema } from '../onboarding';
import { requireGuildMember } from './member-access';
import { onboardingActor } from './onboarding-access';
import { readOnboarding, mutateOnboarding, onboardingView } from './onboarding-store';

type Context = { params: Promise<{ guildId: string }> };
async function context(ctx: Context, write: boolean) {
  const session = await requireApiSession();
  const parsed = onboardingGuildId.safeParse((await ctx.params).guildId);
  if (!parsed.success) throw new AppError('Invalid guild ID.', 400, 'INVALID_GUILD_ID', true);
  const limit = await checkRateLimit(`guild:onboarding:${write ? 'write' : 'read'}:${session.user.id}`, {
    limit: write ? 30 : 60,
    windowMs: 60_000,
  });
  if (!limit.allowed)
    throw new AppError(
      'Onboarding requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'ONBOARDING_LIMITED',
      true,
    );
  if (!(await spendReadBudget()).allowed)
    throw new AppError('Guild verification is temporarily limited.', 429, 'ONBOARDING_LIMITED', true);
  const actor = onboardingActor(parsed.data, await requireGuildMember(session, parsed.data));
  return { session, guildId: parsed.data, actor };
}
export async function getGuildOnboarding(_request: Request, ctx: Context) {
  const access = await context(ctx, false);
  return json({ ok: true, data: onboardingView(await readOnboarding(access.guildId), access.actor) });
}
export async function mutateGuildOnboarding(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const access = await context(ctx, true);
  const bytes = await readBoundedBody(request, 32_768);
  if (!bytes) throw new AppError('Onboarding details are too large.', 413, 'ONBOARDING_BODY_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid onboarding details.', 400, 'INVALID_ONBOARDING', true);
  }
  const input = onboardingInputSchema.safeParse(raw);
  if (!input.success) throw new AppError('Check onboarding fields and limits.', 400, 'INVALID_ONBOARDING', true);
  const book = await mutateOnboarding(access.guildId, input.data, access.actor);
  void recordAudit({
    event: 'guild.onboarding_updated',
    outcome: 'success',
    actor: access.session.user.id,
    data: { guildId: access.guildId, action: input.data.action },
  });
  return json({ ok: true, data: onboardingView(book, access.actor) });
}
