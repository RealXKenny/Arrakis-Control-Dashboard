import '../../../lib/assert-server';
import { checkRateLimit, UNKNOWN_CLIENT_ADDRESS } from '../../../lib/security/rate-limit';

const WINDOW_MS = 15 * 60_000;

/**
 * Budgets for one email/password attempt. All three must pass.
 *
 * The per-email budget ignores the address on purpose: spreading guesses over many addresses must not multiply
 * an attacker's attempts against one account. Discord sign-in stays available to the account owner.
 *
 * The shared per-address budget is skipped when no trustworthy address exists (no forwarding header and no
 * socket in Auth.js callbacks). Otherwise every such caller would share one bucket and 40 failed guesses from
 * anyone would lock password sign-in for every member.
 */
export async function checkPasswordLoginLimits(address: string, email: string): Promise<boolean> {
  const known = address !== UNKNOWN_CLIENT_ADDRESS;
  const results = await Promise.all([
    checkRateLimit(`auth:login:email:${email}`, { limit: 10, windowMs: WINDOW_MS }),
    checkRateLimit(`auth:login:${address}:${email}`, { limit: 8, windowMs: WINDOW_MS }),
    known ? checkRateLimit(`auth:login:${address}`, { limit: 40, windowMs: WINDOW_MS }) : null,
  ]);
  return results.every((result) => result === null || result.allowed);
}
