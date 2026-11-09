import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '../../../../components/ui/page-header';
import { LocalTime } from '../../../../components/ui/local-time';
import { requireSession } from '../../../../features/auth/server/session';
import { formatCredits, gameById } from '../../../../features/casino/contracts';
import { casinoHistory } from '../../../../features/casino/server/service';

export const metadata: Metadata = { title: 'Casino game history' };

export default async function CasinoHistoryPage() {
  const session = await requireSession();
  const rows = await casinoHistory(session, 50);

  return (
    <>
      <PageHeader eyebrow="The Solaris Exchange" title="Game history">
        <p className="max-w-md text-sm leading-relaxed text-sand-400">
          Your own rounds only. Open rounds show nothing about the hidden state.
        </p>
      </PageHeader>
      {rows.length === 0 ? (
        <p className="panel p-6 text-sm text-sand-400">
          No rounds yet.{' '}
          <Link href="/casino" className="underline">
            Pick a table.
          </Link>
        </p>
      ) : (
        <div className="panel overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Your most recent rounds, newest first</caption>
            <thead className="text-xs text-sand-500">
              <tr>
                <th scope="col" className="py-2 pr-4 font-normal">
                  When
                </th>
                <th scope="col" className="py-2 pr-4 font-normal">
                  Game
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Staked
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Returned
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  Net
                </th>
                <th scope="col" className="py-2 font-normal">
                  Verify
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sand-200/10 text-sand-200">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2 pr-4">
                    <LocalTime value={row.createdAt} />
                  </td>
                  <td className="py-2 pr-4">{gameById(row.game)?.name ?? row.game}</td>
                  <td className="py-2 pr-4 text-right">{formatCredits(row.stake)}</td>
                  <td className="py-2 pr-4 text-right">{row.payout === null ? '-' : formatCredits(row.payout)}</td>
                  <td className="py-2 pr-4 text-right">
                    {row.status === 'open'
                      ? 'In play'
                      : row.status === 'voided'
                        ? 'Cancelled'
                        : row.net === null
                          ? '-'
                          : `${BigInt(row.net) > 0n ? '+' : ''}${formatCredits(row.net)}`}
                  </td>
                  <td className="py-2">
                    {row.status === 'settled' ? (
                      <Link href={`/casino/fairness?round=${encodeURIComponent(row.id)}`} className="underline">
                        Verify
                      </Link>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
