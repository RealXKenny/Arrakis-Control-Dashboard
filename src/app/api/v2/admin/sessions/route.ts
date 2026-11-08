import { requireRecentSignIn } from '../../../../../features/admin/server/access';
import { requireApiAdmin, spendAdminBudget } from '../../../../../features/admin/server/api-access';
import { revokeAllSessionsForUser } from '../../../../../features/auth/server/session-store';
import { recordAudit } from '../../../../../lib/security/audit';
import { assertSameOrigin, json, route } from '../../../../../server/http';

export const dynamic = 'force-dynamic';

/**
 * "Sign out everywhere" for the calling administrator. There is deliberately no way to name another member: the
 * target is always the verified session's own user, so one administrator cannot revoke another's sessions here.
 */
export const DELETE = route(async (request) => {
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  requireRecentSignIn(session, { highRisk: true });
  await spendAdminBudget(session);
  await revokeAllSessionsForUser(session.user.id);
  void recordAudit({ event: 'admin.sessions_revoked', outcome: 'success', actor: session.user.id });
  return json({ ok: true, signedOut: true });
});
