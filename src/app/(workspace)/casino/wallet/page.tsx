import type { Metadata } from 'next';
import { Notice, PageHeader } from '../../../../components/ui/page-header';
import { requireSession } from '../../../../features/auth/server/session';
import { TransferPanel } from '../../../../features/casino/components/transfer-panel';
import { WalletControls } from '../../../../features/casino/components/wallet-controls';
import { STAKES_NOTICE, formatCredits } from '../../../../features/casino/contracts';
import { loadWallet, ownTransfers, walletEntries } from '../../../../features/casino/server/service';

export const metadata: Metadata = { title: 'Casino wallet' };

const KINDS: Record<string, string> = {
  deposit_credit: 'Deposit from game',
  reserve: 'Wager placed',
  release: 'Wager returned',
  settle: 'Round settled',
  withdrawal_finalize: 'Withdrawal to game',
};

const signed = (value: string) => (BigInt(value) > 0n ? `+${formatCredits(value)}` : formatCredits(value));

export default async function CasinoWalletPage() {
  const session = await requireSession();
  const [wallet, entries, transfers] = await Promise.all([
    loadWallet(session),
    walletEntries(session),
    ownTransfers(session),
  ]);

  return (
    <>
      <PageHeader eyebrow="The Solaris Exchange" title="Wallet">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Real in-game Solaris, held here while you play.
        </p>
      </PageHeader>

      {!wallet.enabled && (
        <div className="mb-6">
          <Notice tone="warn" title="The Solaris Exchange is closed">
            Real Solaris play is not switched on for this server. Deposits, withdrawals and wagers are refused until an
            administrator enables it. Anything already in your wallet stays yours.
          </Notice>
        </div>
      )}

      <section aria-labelledby="balance" className="panel p-6">
        <h2 id="balance" className="eyebrow">
          Casino wallet
        </h2>
        <p className="mt-3 text-3xl font-bold text-sand-50">{formatCredits(wallet.solaris.available)} Solaris</p>
        <p className="text-sm text-sand-400">
          Available. {formatCredits(wallet.solaris.reserved)} is held in unfinished rounds and pending withdrawals.
        </p>
        <p className="mt-3 text-xs text-sand-300">{STAKES_NOTICE}</p>
        <p className="mt-1 text-xs text-sand-500">
          Largest wager {formatCredits(wallet.limits.maxWager)}. Largest payout for one round{' '}
          {formatCredits(wallet.limits.maxPayout)}.
        </p>
      </section>

      <div className="mt-8">
        <TransferPanel enabled={wallet.enabled} available={wallet.solaris.available} initial={transfers} />
      </div>

      <div className="mt-8">
        <WalletControls pausedUntil={wallet.pausedUntil} />
      </div>

      <section id="transactions" aria-labelledby="transactions-title" className="mt-8 panel p-6">
        <h2 id="transactions-title" className="eyebrow">
          Wallet transactions
        </h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-sand-500">No transactions yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Most recent wallet ledger entries, newest first</caption>
              <thead className="text-xs text-sand-500">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    #
                  </th>
                  <th scope="col" className="py-2 pr-4 font-normal">
                    Type
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Available
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-normal">
                    Held
                  </th>
                  <th scope="col" className="py-2 text-right font-normal">
                    Balance after
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sand-200/10 text-sand-200">
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="py-2 pr-4 font-mono text-xs text-sand-500">{entry.seq}</td>
                    <td className="py-2 pr-4">{KINDS[entry.kind] ?? entry.kind}</td>
                    <td className="py-2 pr-4 text-right">{signed(entry.availableDelta)}</td>
                    <td className="py-2 pr-4 text-right">{signed(entry.reservedDelta)}</td>
                    <td className="py-2 text-right">{formatCredits(entry.availableAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
