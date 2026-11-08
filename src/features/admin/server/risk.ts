import '../../../lib/assert-server';
import type { AdminOperation } from '../types';

/**
 * Administrator operations that change nothing destructive or sensitive: they only ask the Console to check, probe,
 * list or verify something. Everything else that is not a plain read is HIGH RISK and needs an interactive sign-in
 * within ADMIN_HIGH_RISK_REAUTH_MINUTES. The list is deliberately explicit and short: a new catalog operation is
 * strict by default until someone reviews it and adds it here.
 */
export const LOW_RISK_MUTATING_OPERATIONS: ReadonlySet<string> = new Set([
  'post-updates-check-game',
  'post-updates-check-stack',
  'post-players-list-settings',
  'post-exchange-market-buyback-probe',
  'post-integrations-discord-players-link-verify',
  // Restricted for API keys (they never reach the Console) but classified so the catalog stays fully covered.
  'post-auth-login',
  'post-auth-logout',
  'post-setup-preflight',
]);

/** True when the operation needs the stricter (60 minute by default) sign-in window. */
export function isHighRiskOperation(operation: Pick<AdminOperation, 'id' | 'method' | 'mode' | 'confirmationPhrases'>) {
  if (operation.mode === 'download' || operation.mode === 'upload' || operation.mode === 'multipart') return true;
  if (operation.method === 'DELETE' || operation.confirmationPhrases.length > 0) return true;
  // Plain reads stay available; any other method defaults to strict unless explicitly reviewed as low risk.
  if (operation.method === 'GET') return false;
  return !LOW_RISK_MUTATING_OPERATIONS.has(operation.id);
}
