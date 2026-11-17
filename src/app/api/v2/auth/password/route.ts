import { setPasswordSchema } from '../../../../../features/auth/schemas';
import { AppError } from '../../../../../lib/errors';
import { readBoundedBody } from '../../../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../../../lib/security/rate-limit';
import { recordAudit } from '../../../../../lib/security/audit';
import { saveSession } from '../../../../../features/auth/server/session-store';
import { hashPassword } from '../../../../../features/auth/server/password';
import { getAccount, saveAccount } from '../../../../../features/auth/server/users';
import { assertSameOrigin, json, requireApiSession, route } from '../../../../../server/http';
import { currentSessionId } from '../../../../../features/auth/server/session';

const MAX_BODY_BYTES = 2048;

/** Finish Discord signup: attach a password to the Discord-verified email already on the session. */
export const POST = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiSession();
  const sessionId = await currentSessionId();
  if (!sessionId) throw new AppError('Sign in to continue.', 401, 'UNAUTHORIZED', true);

  const limit = await checkRateLimit(`auth:set-password:${session.user.id}`, { limit: 6, windowMs: 15 * 60_000 });
  if (!limit.allowed) throw new AppError('Too many attempts. Try again later.', 429, 'RATE_LIMITED', true);

  const body = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!body) throw new AppError('Request is too large.', 413, 'BODY_TOO_LARGE', true);
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new AppError('Invalid request.', 400, 'INVALID_BODY', true);
  }
  const parsed = setPasswordSchema.safeParse(payload);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message ?? 'Invalid password.', 422, 'INVALID_PASSWORD', true);
  }

  // The email comes from the verified session, never from the request body.
  const account = await getAccount(session.user.id);
  if (!session.email || !account || account.email !== session.email) {
    throw new AppError('Discord did not share a verified email for this account.', 409, 'NO_VERIFIED_EMAIL', true);
  }
  if (account.passwordHash && !session.needsPassword) {
    throw new AppError('A password is already set for this account.', 409, 'PASSWORD_EXISTS', true);
  }

  await saveAccount({ ...account, passwordHash: await hashPassword(parsed.data.password) });
  await saveSession(sessionId, { ...session, needsPassword: false }, { onlyIfExists: true });
  void recordAudit({ event: 'auth.password_set', outcome: 'success', actor: session.user.id });
  return json({ ok: true });
});
