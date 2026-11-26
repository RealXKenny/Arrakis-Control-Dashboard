import '../../../lib/assert-server';
import { getClientAddress } from '../../../lib/security/rate-limit';
import { json } from '../../../server/http';
import { type ActivitySessionResponse, sessionRequestSchema, tableActionSchema } from '../contracts';
import { identifyActivityPlayer, verifyActivityInstance } from './discord-activity';
import { assertActivityOrigin, enforcePokerLimit, readJson, requirePokerEnabled } from './http';
import { actOnPokerTable, readPokerTable } from './service';
import { issueActivitySession, requireActivitySession } from './session';

function headerRecord(request: Request): Record<string, string> {
  return Object.fromEntries(request.headers.entries());
}

/** POST /api/v2/poker/session: Embedded App SDK code in, short-lived Activity bearer token out. */
export async function createSession(request: Request): Promise<Response> {
  requirePokerEnabled();
  assertActivityOrigin(request);
  await enforcePokerLimit(`session:${getClientAddress({ headers: headerRecord(request) })}`, {
    limit: 10,
    windowMs: 60_000,
  });
  const input = await readJson(request, sessionRequestSchema, 2048);
  const player = await identifyActivityPlayer(input.code);
  await verifyActivityInstance(input.instanceId, player.userId);
  const { token, session } = await issueActivitySession({
    userId: player.userId,
    displayName: player.displayName,
    instanceId: input.instanceId,
  });
  const body: ActivitySessionResponse = {
    ok: true,
    token,
    expiresAt: session.expiresAt,
    player: { id: session.userId, displayName: session.displayName },
  };
  return json(body);
}

/** GET /api/v2/poker/table: the caller's view of their Activity's table. Hole cards are private. */
export async function getTable(request: Request): Promise<Response> {
  requirePokerEnabled();
  const session = await requireActivitySession(request);
  await enforcePokerLimit(`read:${session.userId}`, { limit: 120, windowMs: 60_000 });
  return json(await readPokerTable(session));
}

/** POST /api/v2/poker/table: one seat or betting action. */
export async function postTableAction(request: Request): Promise<Response> {
  requirePokerEnabled();
  assertActivityOrigin(request);
  const session = await requireActivitySession(request);
  await enforcePokerLimit(`act:${session.userId}`, { limit: 60, windowMs: 60_000 });
  const input = await readJson(request, tableActionSchema, 1024);
  return json(await actOnPokerTable(session, input));
}
