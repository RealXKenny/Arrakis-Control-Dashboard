import '../../../lib/assert-server';
import { createHash, createHmac, hkdfSync } from 'node:crypto';
import { getServerEnv } from '../../../config/env';

/**
 * Marketplace ownership identifiers.
 *
 * Summaries are visible to every member, so an owner key must not let anyone test "did Discord user X publish this?".
 * The v2 key is an HMAC of the Discord ID under a server-only secret (`OWNER_KEY_SECRET`, or a key derived from
 * `AUTH_SECRET` when it is not set). The legacy key was an unkeyed SHA-256 of the ID; it is still *accepted* so
 * listings published before the upgrade stay deletable, but it is never written for new listings. The
 * `marketplace:rekey` maintenance script rewrites legacy keys offline.
 */
const OWNER_KEY_LENGTH = 16;

function secret(): Buffer {
  const env = getServerEnv();
  if (env.OWNER_KEY_SECRET) return Buffer.from(env.OWNER_KEY_SECRET, 'utf8');
  if (!env.AUTH_SECRET) throw new Error('OWNER_KEY_SECRET or AUTH_SECRET is required for marketplace ownership.');
  return Buffer.from(hkdfSync('sha256', env.AUTH_SECRET, 'arrakis-owner-key', 'marketplace-owner-v2', 32));
}

export function ownerKeyForId(discordId: string): string {
  return createHmac('sha256', secret()).update(`owner:v2:${discordId}`).digest('hex').slice(0, OWNER_KEY_LENGTH);
}

export function legacyOwnerKeyForId(discordId: string): string {
  return createHash('sha256').update(`base-marketplace-owner:${discordId}`).digest('hex').slice(0, OWNER_KEY_LENGTH);
}

/** Keys that identify this member on stored listings: the current key first, then the legacy one. */
export function ownerKeysForId(discordId: string): [string, string] {
  return [ownerKeyForId(discordId), legacyOwnerKeyForId(discordId)];
}
