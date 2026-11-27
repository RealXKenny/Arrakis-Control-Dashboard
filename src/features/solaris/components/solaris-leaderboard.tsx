'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/form-controls';
import { StatePanel } from '../../../components/ui/state-panel';
import { StatusBadge } from '../../../components/ui/status-badge';
import { useSharedReading } from '../../../lib/ui/use-shared-reading';
import {
  BOARD_PAGE_SIZE,
  MAX_NAME_LENGTH,
  boardSummary,
  compactSolaris,
  filterEntries,
  formatSolaris,
  freshnessLabel,
  paginate,
  type BoardResponse,
  type Freshness,
  type PersonalResponse,
  type SolarisBoard,
  type SolarisEntry,
} from '../model';

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function isFreshness(value: unknown): value is Freshness {
  return (
    isObject(value) &&
    typeof value.fetchedAt === 'number' &&
    (value.state === 'fresh' || value.state === 'stale') &&
    typeof value.refreshFailed === 'boolean'
  );
}
function isBoard(value: unknown): value is SolarisBoard {
  return isObject(value) && Array.isArray(value.entries) && typeof value.players === 'number';
}
const parseBoardResponse = (body: unknown): BoardResponse | null =>
  isObject(body) && body.ok === true && isBoard(body.board) && isFreshness(body.freshness)
    ? (body as BoardResponse)
    : null;
const parsePersonalResponse = (body: unknown): PersonalResponse | null =>
  isObject(body) && body.ok === true && typeof body.linked === 'boolean' ? (body as PersonalResponse) : null;

const name = (entry: SolarisEntry) => entry.name ?? 'Unknown character';

function Freshness({ freshness, now }: { freshness: Freshness | null; now: number }) {
  if (!freshness) return null;
  const tone = freshness.refreshFailed ? 'warning' : freshness.state === 'stale' ? 'neutral' : 'success';
  return (
    <p className="flex flex-wrap items-center gap-3 text-xs text-sand-400" aria-live="polite">
      <StatusBadge tone={tone}>
        {freshness.refreshFailed ? 'Cached' : freshness.state === 'stale' ? 'Refreshing' : 'Current'}
      </StatusBadge>
      <span title={new Date(freshness.fetchedAt).toLocaleString()}>{freshnessLabel(freshness, now)}</span>
    </p>
  );
}

function Rank({ rank }: { rank: number }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  return medal ? (
    <span role="img" aria-label={`Rank ${rank}`}>
      {medal}
    </span>
  ) : (
    <span className="font-mono text-sand-400">{rank}</span>
  );
}

function Stat({ label, value, detail, title }: { label: string; value: string; detail?: string; title?: string }) {
  return (
    <Card as="div" className="ui-card min-w-0 p-4">
      <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-sand-50" title={title}>
        {value}
      </p>
      {detail && <p className="mt-0.5 truncate text-xs text-sand-400">{detail}</p>}
    </Card>
  );
}

function Highlights({ entries }: { entries: readonly SolarisEntry[] }) {
  const summary = boardSummary(entries);
  if (!summary.ranked) return null;
  return (
    <section aria-label="Leaderboard highlights" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Characters ranked" value={summary.ranked.toLocaleString()} />
      <Stat
        label="Solaris on hand"
        value={compactSolaris(summary.total)}
        title={`${formatSolaris(summary.total)} Solaris`}
        detail={summary.topTenShare === null ? undefined : `Top 10 hold ${summary.topTenShare}%`}
      />
      {summary.top && (
        <Stat label="Wealthiest" value={name(summary.top)} detail={`${formatSolaris(summary.top.balance)} Solaris`} />
      )}
      {summary.median !== null && (
        <Stat
          label="Median balance"
          value={compactSolaris(summary.median)}
          title={`${formatSolaris(summary.median)} Solaris`}
        />
      )}
    </section>
  );
}

function Standing({
  personal,
  ranked,
}: {
  personal: ReturnType<typeof useSharedReading<PersonalResponse>>;
  ranked: number;
}) {
  let body: ReactNode;
  if (!personal.data)
    body = personal.loading
      ? 'Checking your linked character…'
      : 'Your linked character could not be checked right now.';
  else if (!personal.data.linked) body = 'Link a character on the Character page to see where you rank.';
  else if (!personal.data.entry) body = 'Your character is not on the board yet. It appears after the next refresh.';
  else
    body = (
      <>
        <span className="font-semibold text-sand-50">{name(personal.data.entry)}</span> is ranked{' '}
        <span className="font-semibold text-spice-300">#{personal.data.entry.rank.toLocaleString()}</span> of{' '}
        {ranked.toLocaleString()} with{' '}
        <span className="font-mono text-spice-300">{formatSolaris(personal.data.entry.balance)}</span> Solaris.
      </>
    );
  return (
    <Card as="section" aria-label="Your standing" className="ui-card mb-5 p-4">
      <h2 className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Your standing</h2>
      <p className="mt-1 text-sm text-sand-200">{body}</p>
    </Card>
  );
}

function share(balance: string, total: bigint): string {
  if (total <= 0n) return '—';
  const basis = (BigInt(balance) * 1000n) / total;
  return `${basis / 10n}.${basis % 10n}%`;
}

function Ranking({ entries, total, mine }: { entries: SolarisEntry[]; total: bigint; mine: SolarisEntry | null }) {
  const isMine = (entry: SolarisEntry) =>
    mine !== null && entry.rank === mine.rank && entry.name === mine.name && entry.balance === mine.balance;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Characters ranked by Solaris on hand</caption>
          <thead className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
            <tr className="border-b border-sand-200/10">
              <th scope="col" className="w-16 px-3 py-2">
                Rank
              </th>
              <th scope="col" className="px-3 py-2">
                Character
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Solaris
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={`${entry.rank}:${index}:${entry.name}`}
                className={`border-b border-sand-200/5 ${isMine(entry) ? 'bg-spice-500/10' : ''}`}
                aria-current={isMine(entry) ? 'true' : undefined}
              >
                <td className="px-3 py-3">
                  <Rank rank={entry.rank} />
                </td>
                <th scope="row" className="px-3 py-3 font-semibold text-sand-50">
                  {name(entry)}
                  {isMine(entry) && <span className="ml-2 text-xs font-normal text-spice-300">(you)</span>}
                </th>
                <td className="px-3 py-3 text-right font-mono text-spice-300">{formatSolaris(entry.balance)}</td>
                <td className="px-3 py-3 text-right font-mono text-sand-300">{share(entry.balance, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="grid gap-2 md:hidden" aria-label="Characters ranked by Solaris on hand">
        {entries.map((entry, index) => (
          <li key={`${entry.rank}:${index}:${entry.name}`}>
            <Card
              as="div"
              className={`ui-card flex items-center justify-between gap-3 p-4 ${isMine(entry) ? 'bg-spice-500/10' : ''}`}
            >
              <p className="flex min-w-0 items-center gap-3">
                <Rank rank={entry.rank} />
                <span className="truncate font-semibold text-sand-50">{name(entry)}</span>
              </p>
              <p className="font-mono text-spice-300">{formatSolaris(entry.balance)}</p>
            </Card>
          </li>
        ))}
      </ol>
    </>
  );
}

function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (page: number) => void }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Leaderboard pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-sand-300">
      <Button type="button" variant="secondary" disabled={page <= 0} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span>
        Page {page + 1} of {pages}
      </span>
      <Button type="button" variant="secondary" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

export function SolarisLeaderboard({ initialBoard }: { initialBoard: BoardResponse | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);

  const refreshMs = Math.max(60_000, (initialBoard?.refreshSeconds ?? 600) * 1000);
  const board = useSharedReading('/api/v2/solaris?view=board', {
    initial: initialBoard,
    intervalMs: refreshMs,
    parse: parseBoardResponse,
    initialMatchesUrl: true,
  });
  const personal = useSharedReading('/api/v2/solaris?view=personal', {
    initial: null,
    intervalMs: refreshMs,
    parse: parsePersonalResponse,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setPage(0), [query]);

  const entries = useMemo(() => board.data?.board.entries ?? [], [board.data]);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + BigInt(entry.balance), 0n), [entries]);
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query]);
  const pageOfEntries = paginate(filtered, page, BOARD_PAGE_SIZE);

  if (!board.data) {
    if (board.loading) return <StatePanel kind="loading" title="Counting Solaris…" />;
    return (
      <StatePanel kind="error" title="The Solaris leaderboard is unavailable" onRetry={board.retry}>
        No reading has been retrieved yet, so nothing is shown rather than guessed. The page retries on its own.
      </StatePanel>
    );
  }

  const { players, unreadable, truncated } = board.data.board;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Freshness freshness={board.data.freshness} now={now} />
        <p className="text-xs text-sand-400">
          {entries.length.toLocaleString()} of {players.toLocaleString()} characters ranked
        </p>
      </div>
      {board.failed && (
        <p
          role="status"
          className="mb-4 border-l-4 border-l-status-warn bg-status-warn/10 px-3 py-2 text-sm text-sand-100"
        >
          The latest check did not complete. The last good reading stays on screen and the page keeps trying.
        </p>
      )}
      {(unreadable > 0 || truncated) && (
        <p className="mb-4 text-xs text-sand-400">
          {unreadable > 0 &&
            `${unreadable.toLocaleString()} ${unreadable === 1 ? 'balance' : 'balances'} could not be read this time and ${unreadable === 1 ? 'is' : 'are'} left out. `}
          {truncated && 'The server has more characters than one refresh reads, so only the first 2,000 are ranked.'}
        </p>
      )}
      <Highlights entries={entries} />
      <Standing personal={personal} ranked={entries.length} />
      <Card as="section" className="ui-card mb-5 grid gap-4 p-4 sm:grid-cols-2" aria-label="Filters">
        <Field label="Search">
          <input
            type="search"
            className={inputClass}
            value={query}
            maxLength={MAX_NAME_LENGTH}
            placeholder="Character name"
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
      </Card>
      {filtered.length === 0 ? (
        <StatePanel title={entries.length ? 'No characters match this search' : 'No Solaris balances yet'}>
          {entries.length
            ? 'Clear the search or try another character name.'
            : 'Characters appear here once the Console reports their Solaris.'}
        </StatePanel>
      ) : (
        <>
          <Ranking entries={pageOfEntries.items} total={total} mine={personal.data?.entry ?? null} />
          <Pager page={pageOfEntries.page} pages={pageOfEntries.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}
