'use client';

import { useState } from 'react';
import { ErrorBanner } from './parts';
import { CasinoError, casinoApi } from './api';

type Fairness = Awaited<ReturnType<typeof casinoApi.fairness>>;
type Verification = Awaited<ReturnType<typeof casinoApi.verify>>;

const fail = (caught: unknown) =>
  caught instanceof CasinoError ? caught.message : 'Something went wrong. Please try again.';
const REASONS: Record<string, string> = {
  ROUND_NOT_FINISHED: 'This round has not finished yet.',
  SEED_NOT_RETIRED:
    'The seed for this round is still active. Rotate your seed to retire it and make this round verifiable.',
  UNKNOWN_GAME: 'This game cannot be verified.',
};

/** Seed state, client-seed control, rotation (which reveals the retired server seed) and round verification. */
export function FairnessPanel({ initial, initialRound }: { initial: Fairness; initialRound: string }) {
  const [state, setState] = useState(initial);
  const [clientSeed, setClientSeed] = useState('');
  const [roundId, setRoundId] = useState(initialRound);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (caught) {
      setError(fail(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="seed-title" className="panel p-6">
        <h2 id="seed-title" className="eyebrow">
          Your current seed
        </h2>
        <dl className="mt-4 grid gap-3 text-sm">
          <div>
            <dt className="text-xs text-sand-500">Server seed commitment (SHA-256)</dt>
            <dd className="break-all font-mono text-sand-100">
              {state.commitment ?? 'Created when you play your first round.'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-sand-500">Client seed</dt>
            <dd className="break-all font-mono text-sand-100">{state.clientSeed ?? '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-sand-500">Rounds played on this seed (next nonce)</dt>
            <dd className="font-mono text-sand-100">{state.nonce}</dd>
          </div>
        </dl>
        <form
          className="mt-5 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await casinoApi.setClientSeed(clientSeed);
              setState(await casinoApi.fairness());
              setClientSeed('');
            });
          }}
        >
          <label className="flex w-full min-w-0 flex-col gap-2 sm:w-auto">
            <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">New client seed</span>
            <input
              value={clientSeed}
              onChange={(event) => setClientSeed(event.target.value.replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64))}
              placeholder="letters, numbers, . _ -"
              className="w-full max-w-64 border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 text-sm text-sand-50 focus:border-spice-400"
            />
          </label>
          <button
            type="submit"
            className="btn btn-ghost disabled:opacity-50"
            disabled={busy || clientSeed.length === 0}
          >
            Set client seed
          </button>
          <button
            type="button"
            className="btn btn-primary whitespace-normal py-2 text-center disabled:opacity-50"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await casinoApi.rotateSeed();
                setState(await casinoApi.fairness());
              })
            }
          >
            Rotate seed and reveal the old one
          </button>
        </form>
        <p className="mt-3 text-xs text-sand-500">
          Rotation is refused while you have an unfinished round, so a seed can never be revealed while it still
          protects hidden game state.
        </p>
      </section>

      <section aria-labelledby="retired-title" className="panel p-6">
        <h2 id="retired-title" className="eyebrow">
          Retired seeds
        </h2>
        {state.revealed.length === 0 ? (
          <p className="mt-3 text-sm text-sand-500">None yet. A seed appears here, in full, after you rotate it.</p>
        ) : (
          <ul className="mt-3 space-y-3 text-xs">
            {state.revealed.map((seed) => (
              <li key={seed.commitment} className="border border-sand-200/10 p-3">
                <p className="text-sand-500">Commitment</p>
                <p className="break-all font-mono text-sand-100">{seed.commitment}</p>
                <p className="mt-2 text-sand-500">Server seed ({seed.rounds} rounds)</p>
                <p className="break-all font-mono text-sand-100">{seed.serverSeed}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="verify-title" className="panel p-6">
        <h2 id="verify-title" className="eyebrow">
          Verify a round
        </h2>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => setVerification(await casinoApi.verify(roundId.trim())));
          }}
        >
          <label className="flex w-full min-w-0 flex-col gap-2 sm:w-auto">
            <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Round ID</span>
            <input
              value={roundId}
              onChange={(event) => setRoundId(event.target.value)}
              className="w-full max-w-80 border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 font-mono text-sm text-sand-50 focus:border-spice-400"
            />
          </label>
          <button
            type="submit"
            className="btn btn-primary disabled:opacity-50"
            disabled={busy || roundId.trim().length === 0}
          >
            Verify
          </button>
        </form>
        {verification && (
          <div role="status" className="mt-4 text-sm text-sand-200">
            {!verification.verifiable ? (
              <p>{REASONS[verification.reason] ?? 'This round cannot be verified yet.'}</p>
            ) : (
              <>
                <p className={verification.ok ? 'font-bold text-spice-300' : 'font-bold text-status-danger'}>
                  {verification.ok
                    ? 'Verified: replaying the retired seed reproduces this round exactly.'
                    : `Mismatch: ${verification.reason}`}
                </p>
                <p className="mt-3 text-xs text-sand-500">Everything needed to check it yourself:</p>
                <pre className="mt-1 overflow-x-auto border border-sand-200/10 bg-obsidian-950 p-3 text-xs text-sand-300">
                  {JSON.stringify(verification.inputs, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </section>
      <ErrorBanner message={error} />
    </div>
  );
}
