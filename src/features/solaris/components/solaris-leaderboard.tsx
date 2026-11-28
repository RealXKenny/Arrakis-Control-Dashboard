'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
  placeLabel,
  timeLeft,
  type BoardResponse,
  type Freshness,
  type PersonalResponse,
  type SolarisBoard,
  type SolarisEntry,
  type WeeklyPrize,
  type WeeklyResponse,
} from '../model';

export type SolarisTab = 'richest' | 'weekly';

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
const parseWeeklyResponse = (body: unknown): WeeklyResponse | null =>
  isObject(body) &&
  body.ok === true &&
  isObject(body.week) &&
  Array.isArray(body.week.standings) &&
  Array.isArray(body.prizes)
    ? (body as WeeklyResponse)
    : null;

const name = (entry: { name: string | null }) => entry.name ?? 'Unknown character';
const label = 'font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400';

function FreshnessLine({ freshness, now }: { freshness: Freshness | null; now: number }) {
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

function Stat({ title, value, detail, hint }: { title: string; value: string; detail?: string; hint?: string }) {
  return (
    <Card as="div" className="ui-card min-w-0 p-4">
      <p className={label}>{title}</p>
      <p className="mt-1 truncate text-lg font-semibold text-sand-50" title={hint}>
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
      <Stat title="Characters ranked" value={summary.ranked.toLocaleString()} />
      <Stat
        title="Solaris held"
        value={compactSolaris(summary.total)}
        hint={`${formatSolaris(summary.total)} Solaris`}
        detail={summary.topTenShare === null ? 'Bank and coins' : `Top 10 hold ${summary.topTenShare}%`}
      />
      {summary.top && (
        <Stat title="Wealthiest" value={name(summary.top)} detail={`${formatSolaris(summary.top.balance)} Solaris`} />
      )}
      {summary.median !== null && (
        <Stat
          title="Median balance"
          value={compactSolaris(summary.median)}
          hint={`${formatSolaris(summary.median)} Solaris`}
        />
      )}
    </section>
  );
}

function YourStanding({
  personal,
  ranked,
  children,
}: {
  personal: { data: PersonalResponse | null; loading: boolean };
  ranked: number;
  children?: ReactNode;
}) {
  let body: ReactNode;
  if (!personal.data)
    body = personal.loading
      ? 'Checking your linked character…'
      : 'Your linked character could not be checked right now.';
  else if (!personal.data.linked) body = 'Link a character on the Character page to see where you rank.';
  else if (!personal.data.entry) body = 'Your character is not on the board yet. It appears after the next refresh.';
  else {
    const entry = personal.data.entry;
    body = (
      <>
        <span className="font-semibold text-sand-50">{name(entry)}</span> is ranked{' '}
        <span className="font-semibold text-spice-300">#{entry.rank.toLocaleString()}</span> of{' '}
        {ranked.toLocaleString()} with <span className="font-mono text-spice-300">{formatSolaris(entry.balance)}</span>{' '}
        Solaris ({formatSolaris(entry.bank)} banked, {formatSolaris(entry.coins)} in coins).
      </>
    );
  }
  return (
    <Card as="section" aria-label="Your standing" className="ui-card mb-5 p-4">
      <h2 className={label}>Your standing</h2>
      <p className="mt-1 text-sm text-sand-200">{body}</p>
      {children}
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
  const caption = 'Characters ranked by Solaris held';
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className={label}>
            <tr className="border-b border-sand-200/10">
              <th scope="col" className="w-16 px-3 py-2">
                Rank
              </th>
              <th scope="col" className="px-3 py-2">
                Character
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Bank
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Coins
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Total
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
                <td className="px-3 py-3 text-right font-mono text-sand-300">{formatSolaris(entry.bank)}</td>
                <td className="px-3 py-3 text-right font-mono text-sand-300">{formatSolaris(entry.coins)}</td>
                <td className="px-3 py-3 text-right font-mono text-spice-300">{formatSolaris(entry.balance)}</td>
                <td className="px-3 py-3 text-right font-mono text-sand-400">{share(entry.balance, total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ol className="grid gap-2 md:hidden" aria-label={caption}>
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
              <p className="text-right">
                <span className="block font-mono text-spice-300">{formatSolaris(entry.balance)}</span>
                <span className="block text-xs text-sand-400">{formatSolaris(entry.bank)} banked</span>
              </p>
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

const PRIZE_TEXT: Record<WeeklyPrize['state'], string> = {
  available: 'Ready to collect',
  sending: 'Being paid…',
  claimed: 'Paid to your bank',
  uncertain: 'Waiting for an administrator to confirm the payment',
};

function Prizes({ prizes, onClaimed }: { prizes: WeeklyPrize[]; onClaimed: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const claim = useCallback(
    async (prize: WeeklyPrize) => {
      setBusy(prize.weekId);
      setMessage(null);
      try {
        const response = await fetch('/api/v2/solaris', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'claim', weekId: prize.weekId }),
        });
        const body: unknown = await response.json().catch(() => null);
        const result = isObject(body) ? body : {};
        if (response.ok && result.state === 'claimed')
          setMessage(`${formatSolaris(prize.amount)} Solaris were added to your bank.`);
        else if (response.ok && result.state === 'uncertain')
          setMessage('The game server did not confirm the payment. An administrator will check it; nothing is resent.');
        else
          setMessage(typeof result.error === 'string' ? result.error : 'The prize could not be collected right now.');
      } catch {
        setMessage('The prize could not be collected right now. Nothing was sent.');
      } finally {
        setBusy(null);
        onClaimed();
      }
    },
    [onClaimed],
  );
  if (!prizes.length) return null;
  return (
    <div className="mt-3 grid gap-2" aria-label="Your weekly prizes">
      {prizes.map((prize) => (
        <div
          key={prize.weekId}
          className="flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-spice-500 bg-spice-500/10 px-3 py-2"
        >
          <p className="text-sm text-sand-100">
            🏆 {placeLabel(prize.place)} place, week of {prize.weekId}:{' '}
            <span className="font-mono text-spice-300">{formatSolaris(prize.amount)}</span> Solaris ·{' '}
            <span className="text-sand-300">{PRIZE_TEXT[prize.state]}</span>
          </p>
          {prize.state === 'available' && (
            <Button type="button" disabled={busy !== null} onClick={() => void claim(prize)}>
              {busy === prize.weekId ? 'Collecting…' : 'Collect prize'}
            </Button>
          )}
        </div>
      ))}
      {prizes.some((prize) => prize.state === 'available') && (
        <p className="text-xs text-sand-400">
          Log out of the game first: Solaris can only be added safely while your character is offline.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-sand-100">
          {message}
        </p>
      )}
    </div>
  );
}

function Weekly({
  weekly,
  personal,
  now,
  onClaimed,
}: {
  weekly: ReturnType<typeof useSharedReading<WeeklyResponse>>;
  personal: { data: PersonalResponse | null; loading: boolean };
  now: number;
  onClaimed: () => void;
}) {
  if (!weekly.data) {
    if (weekly.loading) return <StatePanel kind="loading" title="Loading this week…" />;
    return (
      <StatePanel kind="error" title="The weekly leaderboard is unavailable" onRetry={weekly.retry}>
        The page retries on its own.
      </StatePanel>
    );
  }
  const { week, prizes, last } = weekly.data;
  const mine = personal.data?.weekly ?? null;
  return (
    <div>
      <section aria-label="This week" className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat title="Week ends in" value={timeLeft(week.endsAt, now)} detail="Mondays 00:00 UTC" />
        <Stat
          title="Prizes"
          value={prizes.length ? `${compactSolaris(prizes[0]!)} for 1st` : 'Ranking only'}
          detail={
            prizes.length
              ? prizes.map((prize, index) => `${placeLabel(index + 1)} ${compactSolaris(prize)}`).join(' · ')
              : 'No prizes are set for this week'
          }
        />
        <Stat title="Characters gaining" value={week.standings.length.toLocaleString()} />
        <Stat
          title="Your gain"
          value={mine ? `+${formatSolaris(mine.gain)}` : '—'}
          detail={mine ? `Rank #${mine.rank}` : 'Earn Solaris this week to place'}
        />
      </section>
      <Card as="section" aria-label="How the weekly board works" className="ui-card mb-5 p-4 text-sm text-sand-300">
        <h2 className={label}>How it works</h2>
        <p className="mt-1">
          Every Monday at 00:00 UTC a new week starts. Whoever adds the most Solaris to their bank and pockets during
          the week wins. Sell at the exchange, run contracts, clear dungeons and trade: everything you earn counts, and
          spending lowers your gain. The week closes automatically and winners collect their prize here.
        </p>
      </Card>
      {personal.data?.prizes && personal.data.prizes.length > 0 && (
        <Card as="section" aria-label="Your prizes" className="ui-card mb-5 p-4">
          <h2 className={label}>Your prizes</h2>
          <Prizes prizes={personal.data.prizes} onClaimed={onClaimed} />
        </Card>
      )}
      {last && last.winners.length > 0 && (
        <Card as="section" aria-label="Last week's winners" className="ui-card mb-5 p-4">
          <h2 className={label}>Last week&apos;s winners · week of {last.id}</h2>
          <ol className="mt-2 grid gap-1 text-sm">
            {last.winners.map((winner) => (
              <li key={winner.place} className="flex flex-wrap items-center gap-x-3 text-sand-200">
                <Rank rank={winner.place} />
                <span className="font-semibold text-sand-50">{name(winner)}</span>
                <span className="font-mono text-spice-300">+{formatSolaris(winner.gain)}</span>
                {BigInt(winner.prize) > 0n && (
                  <span className="text-sand-400">won {formatSolaris(winner.prize)} Solaris</span>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}
      {week.standings.length === 0 ? (
        <StatePanel title="No gains recorded yet this week">
          The board updates every few minutes. Earn some Solaris and you will show up here.
        </StatePanel>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Solaris gained this week</caption>
            <thead className={label}>
              <tr className="border-b border-sand-200/10">
                <th scope="col" className="w-16 px-3 py-2">
                  Rank
                </th>
                <th scope="col" className="px-3 py-2">
                  Character
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Gained this week
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Prize
                </th>
              </tr>
            </thead>
            <tbody>
              {week.standings.map((row, index) => (
                <tr key={`${row.rank}:${index}`} className="border-b border-sand-200/5">
                  <td className="px-3 py-3">
                    <Rank rank={row.rank} />
                  </td>
                  <th scope="row" className="px-3 py-3 font-semibold text-sand-50">
                    {name(row)}
                  </th>
                  <td className="px-3 py-3 text-right font-mono text-spice-300">+{formatSolaris(row.gain)}</td>
                  <td className="px-3 py-3 text-right font-mono text-sand-300">
                    {prizes[index] ? formatSolaris(prizes[index]!) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {week.updatedAt && (
        <p className="mt-3 text-xs text-sand-400">Last recorded {new Date(week.updatedAt).toLocaleString()}.</p>
      )}
    </div>
  );
}

export function SolarisLeaderboard({ tab, initialBoard }: { tab: SolarisTab; initialBoard: BoardResponse | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [stale, setStale] = useState(initialBoard?.freshness.state === 'stale');

  const refreshMs = Math.max(60_000, (initialBoard?.refreshSeconds ?? 600) * 1000);
  // While a refresh is on its way, check back every minute so new numbers appear soon after it lands.
  const board = useSharedReading('/api/v2/solaris?view=board', {
    initial: initialBoard,
    intervalMs: stale ? 60_000 : refreshMs,
    parse: parseBoardResponse,
    initialMatchesUrl: true,
  });
  const [personalKey, setPersonalKey] = useState(0);
  const personal = useSharedReading(`/api/v2/solaris?view=personal&r=${personalKey}`, {
    initial: null,
    intervalMs: refreshMs,
    parse: parsePersonalResponse,
  });
  const weekly = useSharedReading(tab === 'weekly' ? '/api/v2/solaris?view=weekly' : null, {
    initial: null,
    intervalMs: 120_000,
    parse: parseWeeklyResponse,
  });
  const reloadPersonal = useCallback(() => setPersonalKey((key) => key + 1), []);

  useEffect(() => {
    setStale(board.data?.freshness.state === 'stale');
  }, [board.data]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => setPage(0), [query]);

  const entries = useMemo(() => board.data?.board.entries ?? [], [board.data]);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + BigInt(entry.balance), 0n), [entries]);
  const filtered = useMemo(() => filterEntries(entries, query), [entries, query]);
  const pageOfEntries = paginate(filtered, page, BOARD_PAGE_SIZE);
  const prizes = personal.data?.prizes ?? [];

  if (tab === 'weekly') return <Weekly weekly={weekly} personal={personal} now={now} onClaimed={reloadPersonal} />;

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
        <FreshnessLine freshness={board.data.freshness} now={now} />
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
      <YourStanding personal={personal} ranked={entries.length}>
        <Prizes prizes={prizes} onClaimed={reloadPersonal} />
      </YourStanding>
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
