import { vi } from 'vitest';
import type { EngineDeps } from '../../src/features/casino/engine/round';
import {
  engineError,
  type GameModule,
  type RoundRecord,
  type RoundRef,
  type SeedAllocation,
} from '../../src/features/casino/engine/types';
import { commitSeed, generateServerSeed } from '../../src/features/casino/fairness/rng';
import { applyOperation, createAccount, type Account, type Operation } from '../../src/features/casino/ledger/ledger';

/** In-memory engine dependencies: real reference ledger, version-checked round store, idempotent seeds. */
export const O = 'user-1';
export const S = 'hagga';

/** `balance` is deposited as game-confirmed Solaris, the only way balance enters a wallet. */
export function build(balance = 1000n, games: Record<string, GameModule> = {}, maxPayout = 10n ** 15n) {
  const account: Account = applyOperation(createAccount(O, S, 'solaris'), {
    type: 'deposit_credit',
    key: 'seed',
    amount: balance,
  }).account;
  const accounts = new Map<string, Account>([[O, account]]);
  const rounds = new Map<string, RoundRecord>();
  const seedOf = new Map<string, SeedAllocation>();
  const open = new Set<string>();
  const state = { clock: 1_000, failOn: undefined as string | undefined, failCount: 0, nonce: 0 };
  const walletCalls: Operation[] = [];
  const deps: EngineDeps = {
    games,
    wallet: {
      async apply(owner, _server, _currency, op) {
        if (state.failOn && op.key.includes(state.failOn) && state.failCount > 0) {
          state.failCount -= 1;
          throw new Error('wallet down');
        }
        const current = accounts.get(owner) ?? createAccount(owner, S, 'solaris');
        const result = applyOperation(current, op);
        accounts.set(owner, result.account);
        if (!result.replayed) walletCalls.push(op);
        return result.entry;
      },
    },
    rounds: {
      async create(round) {
        const key = `${round.owner}:${round.id}`;
        const existing = rounds.get(key);
        if (existing) return { round: existing, created: false };
        rounds.set(key, round);
        return { round, created: true };
      },
      async get(ref: RoundRef) {
        const found = rounds.get(`${ref.owner}:${ref.id}`);
        return found && found.server === ref.server ? found : null;
      },
      async cas(round, patch) {
        const key = `${round.owner}:${round.id}`;
        const current = rounds.get(key);
        if (!current || current.version !== round.version || current.status !== round.status)
          throw engineError('STATE_CONFLICT', 'moved');
        const next = { ...current, ...patch, version: current.version + 1 };
        rounds.set(key, next);
        return next;
      },
      async listOpen(offset = 0, limit = 200) {
        return [...rounds.values()]
          .filter((r) => r.status !== 'settled' && r.status !== 'voided')
          .map((r) => ({ owner: r.owner, server: r.server, id: r.id }))
          .slice(offset, offset + limit);
      },
      async forget() {},
    },
    seeds: {
      async allocate(owner, _server, roundId) {
        const key = `${owner}:${roundId}`;
        if (!seedOf.has(key)) {
          const serverSeed = generateServerSeed();
          seedOf.set(key, {
            serverSeed,
            commitment: commitSeed(serverSeed),
            clientSeed: 'default-client',
            nonce: state.nonce++,
          });
        }
        open.add(key);
        return seedOf.get(key)!;
      },
      async release(owner, _server, roundId) {
        open.delete(`${owner}:${roundId}`);
      },
    },
    now: () => state.clock,
    maxPayout,
    audit: vi.fn(),
  };
  const wallet = (owner = O) => accounts.get(owner)!;
  return { deps, state, wallet, rounds, seedOf, open, walletCalls, account };
}
