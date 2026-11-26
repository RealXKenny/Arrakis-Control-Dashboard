import '../../../lib/assert-server';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { getRedisClient } from '../../../lib/redis/client';
import { INSTANCE_ID, SNOWFLAKE } from '../contracts';

/** Activity sessions are short: Discord re-authorizes silently when the Activity is reopened. */
const ACTIVITY_SESSION_SECONDS = 2 * 60 * 60;

const sessionSchema = z
  .object({
    userId: z.string().regex(SNOWFLAKE),
    displayName: z.string().min(1).max(32),
    instanceId: z.string().regex(INSTANCE_ID),
    expiresAt: z.number().int().positive(),
  })
  .strict();
export type ActivitySession = z.infer<typeof sessionSchema>;

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** Only a hash of the bearer token is stored, so a Redis read never yields a usable token. */
function activitySessionKey(token: string): string {
  return `arrakis:poker:session:v1:${createHash('sha256').update(token).digest('hex')}`;
}

function redis() {
  const client = getRedisClient();
  if (!client) throw new AppError('Poker needs Redis, which is unavailable.', 503, 'POKER_UNAVAILABLE', true);
  return client;
}

export async function issueActivitySession(
  input: Omit<ActivitySession, 'expiresAt'>,
): Promise<{ token: string; session: ActivitySession }> {
  const token = randomBytes(32).toString('base64url');
  const session = sessionSchema.parse({ ...input, expiresAt: Date.now() + ACTIVITY_SESSION_SECONDS * 1000 });
  await redis().set(activitySessionKey(token), session, { ex: ACTIVITY_SESSION_SECONDS, nx: true });
  return { token, session };
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header) : null;
  return match?.[1] ?? null;
}

export async function requireActivitySession(request: Request): Promise<ActivitySession> {
  const token = bearerToken(request);
  const expired = () =>
    new AppError('Your poker session ended. Reopen the Activity.', 401, 'POKER_SESSION_REQUIRED', true);
  if (!token || !TOKEN.test(token)) throw expired();
  let stored: unknown;
  try {
    stored = await redis().get(activitySessionKey(token));
  } catch {
    throw new AppError('Poker is unavailable. Try again shortly.', 503, 'POKER_UNAVAILABLE', true);
  }
  const parsed = sessionSchema.safeParse(stored);
  if (!parsed.success || parsed.data.expiresAt <= Date.now()) throw expired();
  return parsed.data;
}
