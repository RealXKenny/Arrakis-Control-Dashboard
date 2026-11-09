import type { GameModule, Settlement } from '../engine/types';
import { Rng, verifyCommitment } from './rng';

/**
 * Independent verification. Given the revealed server seed and a finished round's public record
 * (client seed, nonce, wager, params, action list), anyone can recompute the outcome:
 *   1. SHA256(serverSeed) must equal the commitment published before the round.
 *   2. Replaying `start` and then each recorded action must reproduce the same settlement.
 * An open round's seed is never revealed, so this is only possible after the seed is retired.
 */
export type VerifyInput = {
  serverSeed: string;
  commitment: string;
  clientSeed: string;
  nonce: number;
  wager: bigint;
  params: unknown;
  actions: unknown[];
  /** The round's creation time (`createdAt`); only timed games such as Crash use it. */
  startedAt?: number;
};

export function replayRound(mod: GameModule, input: Omit<VerifyInput, 'commitment'>): Settlement | null {
  const started = mod.start(new Rng(input.serverSeed, input.clientSeed, input.nonce), input.wager, input.params, {
    now: input.startedAt ?? 0,
  });
  let { state, settlement } = started;
  for (const action of input.actions) {
    if (settlement) return null; // actions recorded after the round ended: the record is inconsistent
    ({ state, settlement } = mod.act(state, mod.parseAction(action)));
  }
  return settlement ?? null;
}

export function verifyRound(
  mod: GameModule,
  input: VerifyInput,
  recorded: { payout: string; result: Record<string, unknown> },
): { ok: boolean; reason?: string } {
  if (!verifyCommitment(input.serverSeed, input.commitment)) return { ok: false, reason: 'COMMITMENT_MISMATCH' };
  const replay = replayRound(mod, input);
  if (!replay) return { ok: false, reason: 'REPLAY_INCOMPLETE' };
  // A round never pays more than the table ceiling; a capped round says so and must not exceed the replayed payout.
  const { payoutCapped, ...recordedResult } = recorded.result;
  const payoutMatches =
    payoutCapped === true ? BigInt(recorded.payout) <= replay.payout : replay.payout.toString() === recorded.payout;
  if (!payoutMatches) return { ok: false, reason: 'PAYOUT_MISMATCH' };
  if (JSON.stringify(replay.result) !== JSON.stringify(recordedResult)) return { ok: false, reason: 'RESULT_MISMATCH' };
  return { ok: true };
}
