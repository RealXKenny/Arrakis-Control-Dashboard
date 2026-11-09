import '../../../lib/assert-server';
import { DuneConsoleApiError, getDuneClient } from '../../../server/integrations/dune';
import { MAX_TRANSFER } from '../ledger/amount';
import type { ConsolePort } from '../transfers/service';
import type { AdjustmentOutcome } from '../transfers/types';

/**
 * Server-side Dune Console access for Solaris only (`currencyId: 0`). Callers pass an already
 * verified `playerId`; this module never accepts a currency id or a free-form amount.
 *
 * What the Console really returns (samples supplied by the operator, not guesses):
 *
 *   GET  /api/players/{id}/currency
 *        { capabilities: { currency: true },
 *          rows: [ { currency_id: 0, balance: "12533085", label: "Solari Credit" }, { currency_id: 1, ... } ] }
 *
 *   POST /api/players/{id}/add-currency   { currencyId: 0, amount: -25, confirmation: "ADD CURRENCY" }
 *        { supported: true, backupCreated: false,
 *          result: { ok: true, player: { ..., onlineStatus: "Offline" }, currencyId: 0, amount: -25,
 *                    balance: { currency_id: "Solaris", balance: "12533060" },
 *                    message: "Solari Credit was updated in the database and will be loaded when the player next joins." } }
 *
 * The change is written to the database and loaded when the player next joins. A player who is online could have it
 * overwritten by their live session, which would duplicate or destroy Solaris. So:
 *  - transfers are only started for a player who is Offline (checked by the caller from a fresh verification), and
 *  - an adjustment counts as applied ONLY if the Console's own reply says the player was Offline, names Solaris and
 *    the exact amount, and reports the exact balance we expected. Anything else is uncertain and goes to an administrator.
 *
 * Classification of failures (documented assumptions, not Console guarantees):
 *  - HTTP 400/401/403/404/409/422 -> rejected: the Console answered that it refused the request.
 *  - Everything else (timeout, network error, 5xx, 2xx with an unexpected body) -> uncertain, because the
 *    adjustment may have been applied. Uncertain is never retried automatically.
 */

const PLAYER = /^[A-Za-z0-9_-]{1,64}$/;
const REJECTED_STATUS = new Set([400, 401, 403, 404, 409, 422]);
const ADJUST_TIMEOUT_MS = 15_000;
const SOLARIS = 0;
const WHOLE = /^(0|[1-9][0-9]{0,24})$/;
/** Strict: `Number(null)` and `Number('')` are 0, so a loose comparison would mistake a missing id for Solaris. */
const isSolarisId = (value: unknown) => value === SOLARIS || value === String(SOLARIS);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** The Solaris balance from a `/currency` reply. Strict, so a schema change can never yield a wrong balance. */
export function parseSolarisBalance(payload: unknown): bigint {
  const rows = record(payload).rows;
  if (!Array.isArray(rows)) throw new Error('Unrecognised currency response');
  const solaris = rows.map(record).filter((row) => isSolarisId(row.currency_id));
  if (solaris.length !== 1) throw new Error('Unrecognised currency response');
  const balance = solaris[0]!.balance;
  if (typeof balance === 'number' && Number.isSafeInteger(balance) && balance >= 0) return BigInt(balance);
  if (typeof balance === 'string' && WHOLE.test(balance)) return BigInt(balance);
  throw new Error('Unrecognised currency response');
}

/** Whether a player's reported status means they are logged out. Anything unclear counts as online. */
export function isOffline(status: unknown): boolean {
  return typeof status === 'string' && status.trim().toLowerCase() === 'offline';
}

/**
 * Judge a successful add-currency reply. `applied` only when every fact matches what we asked for and expected;
 * otherwise `uncertain`, because the Console answered but we cannot prove the Solaris moved as intended.
 */
export function judgeAdjustment(payload: unknown, delta: bigint, expectedBalance: bigint): AdjustmentOutcome {
  const root = record(payload);
  const result = record(root.result);
  const balance = record(result.balance);
  const reported = typeof balance.balance === 'string' && WHOLE.test(balance.balance) ? BigInt(balance.balance) : null;
  const applied =
    root.supported !== false &&
    result.ok === true &&
    isOffline(record(result.player).onlineStatus) &&
    isSolarisId(result.currencyId) &&
    typeof result.amount === 'number' &&
    BigInt(result.amount) === delta &&
    reported !== null &&
    reported === expectedBalance;
  return applied ? 'applied' : 'uncertain';
}

export function classifyAdjustmentError(error: unknown): AdjustmentOutcome {
  return error instanceof DuneConsoleApiError && REJECTED_STATUS.has(error.status) ? 'rejected' : 'uncertain';
}

export const consoleGateway: ConsolePort = {
  async getBalance(playerId) {
    if (!PLAYER.test(playerId)) throw new Error('Invalid player');
    const payload = await getDuneClient().request('GET', `/api/players/${encodeURIComponent(playerId)}/currency`, {
      timeoutMs: 10_000,
    });
    return parseSolarisBalance(payload);
  },
  async adjust(playerId, delta, expectedBalance) {
    if (!PLAYER.test(playerId)) return 'rejected'; // nothing was sent
    const magnitude = delta < 0n ? -delta : delta;
    if (delta === 0n || magnitude > MAX_TRANSFER || expectedBalance < 0n) return 'rejected'; // nothing was sent
    try {
      // POST is never retried by the transport; a second attempt could double-apply.
      const payload = await getDuneClient().request(
        'POST',
        `/api/players/${encodeURIComponent(playerId)}/add-currency`,
        {
          body: { currencyId: SOLARIS, amount: Number(delta), confirmation: 'ADD CURRENCY' },
          timeoutMs: ADJUST_TIMEOUT_MS,
          retryRead: false,
        },
      );
      return judgeAdjustment(payload, delta, expectedBalance);
    } catch (error) {
      return classifyAdjustmentError(error);
    }
  },
};
