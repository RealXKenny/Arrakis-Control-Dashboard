import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { recordAudit } from '../../../lib/security/audit';
import type { EngineDeps } from '../engine/round';
import { gameRegistry } from '../games/registry';
import { roundStore } from './round-store';
import { seedStore } from './seed-store';
import { applyWalletOperation } from './wallet-store';

/** Production wiring for the round engine. Real Solaris, held in the member's casino wallet. */
export function engineDeps(games = gameRegistry): EngineDeps {
  return {
    games,
    wallet: { apply: (owner, server, currency, op) => applyWalletOperation(owner, server, currency, op) },
    rounds: roundStore,
    seeds: seedStore,
    now: () => Date.now(),
    maxPayout: BigInt(getServerEnv().CASINO_MAX_PAYOUT),
    audit: (event) => void recordAudit(event),
  };
}
