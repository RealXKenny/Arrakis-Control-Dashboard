import '../../lib/assert-server';
import { createHash } from 'node:crypto';
import { getRedisClient } from '../../lib/redis/client';

/** Account record keyed by the Discord user ID, the same identity every ownership check already uses. */
export type AccountRecord = {
  discordId: string;
  email?: string;
  passwordHash?: string;
  /** AES-GCM sealed Discord refresh token (see password.ts). */
  refreshToken?: string;
  createdAt: number;
};

const globals = globalThis as typeof globalThis & {
  arrakisDevAccounts?: { users: Map<string, AccountRecord>; emails: Map<string, string> };
};
const dev = (globals.arrakisDevAccounts ??= { users: new Map(), emails: new Map() });

const userKey = (discordId: string) => `arrakis:auth:user:${discordId}`;
// Values are stored as `{ discordId }`: a bare all-digit string would be decoded as a (lossy) number.
const emailKey = (email: string) => `arrakis:auth:email2:${createHash('sha256').update(email).digest('hex')}`;

function validRecord(value: unknown): value is AccountRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<AccountRecord>;
  return typeof record.discordId === 'string' && /^\d{1,25}$/.test(record.discordId);
}

export async function getAccount(discordId: string): Promise<AccountRecord | null> {
  if (!/^\d{1,25}$/.test(discordId)) return null;
  const redis = getRedisClient();
  if (!redis) return dev.users.get(discordId) ?? null;
  const stored = await redis.get<unknown>(userKey(discordId));
  return validRecord(stored) ? stored : null;
}

export async function getAccountByEmail(email: string): Promise<AccountRecord | null> {
  const redis = getRedisClient();
  const discordId = redis
    ? (await redis.get<{ discordId?: unknown }>(emailKey(email)))?.discordId
    : dev.emails.get(email);
  return typeof discordId === 'string' ? getAccount(discordId) : null;
}

export async function saveAccount(account: AccountRecord): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    dev.users.set(account.discordId, account);
    return;
  }
  await redis.set(userKey(account.discordId), account);
}

/**
 * Claim an email for an account. Fails when another Discord account already owns it, which stops one
 * person registering an address and then taking over somebody else's email login.
 */
export async function claimEmail(discordId: string, email: string): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) {
    const owner = dev.emails.get(email);
    if (owner && owner !== discordId) return false;
    dev.emails.set(email, discordId);
    return true;
  }
  const claimed = await redis.set(emailKey(email), { discordId }, { nx: true });
  if (claimed) return true;
  return (await redis.get<{ discordId?: unknown }>(emailKey(email)))?.discordId === discordId;
}
