'use client';

import { useState } from 'react';
import { formatCredits, type TransferRow } from '../contracts';
import { CasinoError, casinoApi } from './api';
import { ErrorBanner } from './parts';

type Row = TransferRow & { owner: string; playerId: string; gameBalance: string | null };

/**
 * Administrator screen for transfers whose outcome is unknown. The administrator compares the player's real
 * game balance with what the transfer should have done, then records what happened. It is audited and needs a
 * fresh sign-in; the system never guesses.
 */
export function ReconciliationPanel({ initial }: { initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [note, setNote] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const resolve = async (row: Row, resolution: 'applied' | 'not_applied') => {
    setBusy(row.id);
    setError(null);
    try {
      await casinoApi.adminResolve(row.owner, row.id, resolution, note[row.id] ?? '');
      setRows((current) => current.filter((item) => item.id !== row.id));
    } catch (caught) {
      setError(caught instanceof CasinoError ? caught.message : 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  if (rows.length === 0)
    return <p className="panel p-6 text-sm text-sand-400">Nothing is waiting. Every transfer has a known outcome.</p>;

  return (
    <div className="flex flex-col gap-6">
      <ErrorBanner message={error} />
      {rows.map((row) => (
        <section key={row.id} aria-labelledby={`t-${row.id}`} className="panel p-6">
          <h2 id={`t-${row.id}`} className="text-lg">
            {row.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} of {formatCredits(row.amount)} Solaris
          </h2>
          <dl className="mt-3 grid grid-cols-1 gap-2 text-sm text-sand-300 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-sand-500">Member (Discord ID)</dt>
              <dd className="font-mono">{row.owner}</dd>
            </div>
            <div>
              <dt className="text-xs text-sand-500">Game player ID</dt>
              <dd className="font-mono">{row.playerId}</dd>
            </div>
            <div>
              <dt className="text-xs text-sand-500">Game balance right now</dt>
              <dd>{row.gameBalance === null ? 'Could not be read' : formatCredits(row.gameBalance)}</dd>
            </div>
            <div>
              <dt className="text-xs text-sand-500">Started</dt>
              <dd>{new Date(row.createdAt).toLocaleString()}</dd>
            </div>
          </dl>
          <p className="mt-3 max-w-prose text-sm text-sand-300">
            {row.kind === 'deposit'
              ? 'The game was asked to take this Solaris and the reply was lost. If the member’s game balance dropped by this amount (and nothing else explains it), mark it applied: the wallet is credited once. Otherwise mark it not applied.'
              : 'The game was asked to give this Solaris and the reply was lost. If the member’s game balance rose by this amount, mark it applied: the reserved funds are finalised. Otherwise mark it not applied: the reserve is released.'}
          </p>
          <label className="mt-3 flex flex-col gap-2">
            <span className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
              Note (kept in the audit trail)
            </span>
            <input
              value={note[row.id] ?? ''}
              maxLength={500}
              onChange={(event) => setNote((current) => ({ ...current, [row.id]: event.target.value }))}
              className="w-full border border-sand-200/20 bg-obsidian-900 px-3 py-2.5 text-sm text-sand-50 focus:border-spice-400"
            />
          </label>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              className="btn btn-primary disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void resolve(row, 'applied')}
            >
              Mark applied
            </button>
            <button
              type="button"
              className="btn btn-ghost disabled:opacity-50"
              disabled={busy !== null}
              onClick={() => void resolve(row, 'not_applied')}
            >
              Mark not applied
            </button>
          </div>
        </section>
      ))}
    </div>
  );
}
