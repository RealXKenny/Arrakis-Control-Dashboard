import '../../lib/assert-server';
import { sweepTransfers, quarantinedTransferCount } from '../../features/casino/server/service';
import { recoverClaims } from '../../features/seasons/server/claims';
import { ensureDefaultGenerator, resumeBlockedGenerator, runGenerator } from '../../features/seasons/server/generator';
import { listSeasons } from '../../features/seasons/server/store';
import { startWorkers, type WorkerDefinition } from './runner';

/**
 * The only background operations the dashboard performs on its own. None of them accepts input from a player, none is
 * exposed over HTTP, and none can send a game grant or Solaris transfer that was not already authorized by the
 * player's own click and recorded durably before the worker existed.
 */
export const WORKERS: ReadonlyArray<WorkerDefinition> = [
  {
    name: 'seasons',
    scope:
      'Creates, publishes and archives generated seasons through the existing compare-and-set path. No game writes.',
    intervalMs: 60_000,
    timeoutMs: 45_000,
    retryBudget: 5,
    cooldownMs: 15 * 60_000,
    async run() {
      const resumed = await resumeBlockedGenerator();
      await ensureDefaultGenerator();
      const status = await runGenerator();
      return { resumed: resumed ? 1 : 0, enabled: status.enabled ? 1 : 0 };
    },
  },
  {
    name: 'casino-recovery',
    scope:
      'Finishes confirmed wallet steps and parks interrupted transfers. Never resends an unconfirmed Console adjustment.',
    intervalMs: 60_000,
    timeoutMs: 45_000,
    retryBudget: 5,
    cooldownMs: 15 * 60_000,
    async run() {
      const summary = await sweepTransfers();
      return { ...summary, quarantined: await quarantinedTransferCount() };
    },
  },
  {
    name: 'reward-recovery',
    scope:
      'Parks interrupted season reward sends as quarantined and reports counts. Reads claim records only; never contacts the game.',
    intervalMs: 60_000,
    timeoutMs: 45_000,
    retryBudget: 5,
    cooldownMs: 15 * 60_000,
    async run() {
      let parked = 0,
        quarantined = 0,
        cleared = 0;
      for (const season of await listSeasons(0)) {
        const result = await recoverClaims(season.id);
        parked += result.parked;
        quarantined += result.quarantined;
        cleared += result.cleared;
      }
      return { parked, quarantined, cleared };
    },
  },
];
export function startBackgroundWorkers() {
  startWorkers(WORKERS);
}
