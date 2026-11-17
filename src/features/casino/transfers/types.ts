/**
 * Solaris transfer intents (wallet <-> game account). One durable record per transfer; its state
 * only moves along TRANSITIONS, each move a compare-and-set, so a transfer step can never be sent
 * twice by concurrent callers.
 *
 * created          nothing sent to the Console yet (safe to resume)
 * debit_sent       deposit: the -amount adjustment was about to be / has been sent, outcome unknown
 * credit_sent      withdrawal: the +amount adjustment was about to be / has been sent, outcome unknown
 * game_applied     the Console confirmed the adjustment; only the wallet side remains (idempotent, safe to retry)
 * needs_reconciliation  outcome unknown (timeout, 5xx, ambiguous reply); NEVER retried automatically
 * completed / failed   terminal
 */

export type TransferKind = 'deposit' | 'withdrawal';
export type TransferState =
  'created' | 'debit_sent' | 'credit_sent' | 'game_applied' | 'needs_reconciliation' | 'completed' | 'failed';

export const TERMINAL_STATES: ReadonlySet<TransferState> = new Set(['completed', 'failed']);

export const TRANSITIONS: Readonly<Record<TransferState, readonly TransferState[]>> = {
  created: ['debit_sent', 'credit_sent', 'failed'],
  debit_sent: ['game_applied', 'needs_reconciliation', 'failed'],
  credit_sent: ['game_applied', 'needs_reconciliation', 'failed'],
  game_applied: ['completed'],
  needs_reconciliation: ['game_applied', 'failed'],
  completed: [],
  failed: [],
};

export type TransferIntent = {
  id: string;
  kind: TransferKind;
  /** Server-verified dashboard identity. Never taken from a request body. */
  owner: string;
  server: string;
  /** Server-verified in-game player. */
  playerId: string;
  /** Decimal string; always positive. Deposit sends -amount to the Console, withdrawal sends +amount. */
  amount: string;
  state: TransferState;
  createdAt: number;
  updatedAt: number;
  failureCode?: string;
  /** Who resolved a reconciliation, and their note. */
  resolvedBy?: string;
  resolutionNote?: string;
};

export type IntentRef = { owner: string; server: string; id: string };

export function canTransition(from: TransferState, to: TransferState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Result of a Console adjustment as far as can be PROVEN from the HTTP exchange. */
export type AdjustmentOutcome = 'applied' | 'rejected' | 'uncertain';
