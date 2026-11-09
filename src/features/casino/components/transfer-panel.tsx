'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { formatCredits, transferMessage, type TransferRow } from '../contracts';
import { CasinoError, casinoApi, newRequestKey } from './api';
import { ErrorBanner } from './parts';

type Kind = 'deposit' | 'withdrawal';

/**
 * Move real Solaris between the member's game character and their casino wallet. Nothing is sent until the
 * member confirms the exact amount and direction; the server then re-verifies which character is theirs.
 */
export function TransferPanel({
  enabled,
  available,
  initial,
}: {
  enabled: boolean;
  available: string;
  initial: TransferRow[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('deposit');
  const [amount, setAmount] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A retry after a network failure reuses the key, so the server can never move Solaris twice.
  const key = useRef<string | null>(null);

  const valid = /^[1-9][0-9]{0,11}$/.test(amount);
  const refresh = async () => {
    try {
      setRows(await casinoApi.transfers());
    } catch (caught) {
      setError(caught instanceof CasinoError ? caught.message : 'Could not refresh.');
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    key.current ??= newRequestKey();
    try {
      const done = await casinoApi.transfer(kind, amount, key.current);
      key.current = null;
      setConfirming(false);
      setAmount('');
      setRows((current) => [done, ...current.filter((row) => row.id !== done.id)]);
      router.refresh(); // the balance above is rendered by the server
    } catch (caught) {
      if (caught instanceof CasinoError && caught.code !== 'NETWORK') key.current = null;
      setConfirming(false);
      setError(caught instanceof CasinoError ? caught.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="transfer-title" className="panel p-6">
      <h2 id="transfer-title" className="eyebrow">
        Deposit and withdraw
      </h2>
      <p className="mt-3 max-w-prose text-sm text-sand-300">
        Deposits take Solaris from your game character and add it here. Withdrawals send it back, and the game adds it
        the next time you join. <strong className="text-sand-50">Log out of the game first</strong>: Solaris can only be
        moved while your character is offline. Your available balance is{' '}
        <strong className="text-sand-50">{formatCredits(available)}</strong>. Amounts are final once confirmed.
      </p>
      {!enabled && (
        <p role="status" className="mt-3 border border-spice-400/60 bg-spice-500/10 px-4 py-3 text-sm text-sand-100">
          Deposits and withdrawals are switched off on this server.
        </p>
      )}

      <form
        className="mt-5 flex flex-wrap items-end gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) setConfirming(true);
        }}
      >
        <fieldset className="flex gap-4" disabled={!enabled || busy}>
          <legend className="sr-only">Direction</legend>
          {(['deposit', 'withdrawal'] as const).map((value) => (
            <label key={value} className="flex items-center gap-2 text-sm text-sand-100">
              <input
                type="radio"
                name="transfer-kind"
                checked={kind === value}
                onChange={() => {
                  setKind(value);
                  key.current = null;
                }}
                className="accent-spice-500"
              />
              {value === 'deposit' ? 'Deposit to casino' : 'Withdraw to game'}
            </label>
          ))}
        </fieldset>
        <label className="flex flex-col gap-2">
          <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Amount (Solaris)</span>
          <input
            inputMode="numeric"
            autoComplete="off"
            value={amount}
            disabled={!enabled || busy}
            onChange={(event) => {
              setAmount(event.target.value.replace(/[^0-9]/g, '').slice(0, 12));
              key.current = null;
            }}
            className="w-48 border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 text-sm text-sand-50 focus:border-spice-400 disabled:opacity-50"
          />
        </label>
        <button type="submit" className="btn btn-primary disabled:opacity-50" disabled={!enabled || busy || !valid}>
          Review
        </button>
      </form>

      {confirming && (
        <div
          role="alertdialog"
          aria-labelledby="confirm-transfer"
          className="mt-4 border border-spice-400/60 bg-spice-500/10 p-4"
        >
          <p id="confirm-transfer" className="text-sm text-sand-100">
            {kind === 'deposit'
              ? `Take ${formatCredits(amount)} Solaris from your game character and add it to your casino wallet?`
              : `Send ${formatCredits(amount)} Solaris from your casino wallet to your game character?`}{' '}
            This moves real in-game currency.
          </p>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              className="btn btn-primary disabled:opacity-50"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? 'Working...' : 'Confirm'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="mt-4">
        <ErrorBanner message={error} />
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h3 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Your transfers</h3>
        <button type="button" className="text-sm underline" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-sand-500">No transfers yet.</p>
      ) : (
        <ul className="mt-2 divide-y divide-sand-200/10 text-sm">
          {rows.map((row) => (
            <li key={row.id} className="py-3">
              <p className="text-sand-100">
                {row.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} · {formatCredits(row.amount)} Solaris ·{' '}
                <span className="text-sand-400">{new Date(row.createdAt).toLocaleString()}</span>
              </p>
              <p className="mt-1 text-sand-300">{transferMessage(row)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
