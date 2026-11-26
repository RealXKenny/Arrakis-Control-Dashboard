'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Field, inputClass } from '../../../components/ui/form-controls';
import { StatePanel } from '../../../components/ui/state-panel';
import { StatusBadge } from '../../../components/ui/status-badge';
import { useSharedReading } from '../../../lib/ui/use-shared-reading';
import {
  BOARD_PAGE_SIZE,
  RUNS_PAGE_SIZE,
  difficultyLabel,
  difficultyOptions,
  dungeonName,
  dungeonOptions,
  filterBoard,
  formatDuration,
  freshnessLabel,
  paginate,
  type BoardResponse,
  type BoardSort,
  type DungeonBoard,
  type DungeonRecord,
  type DungeonRun,
  type Freshness,
  type PersonalResponse,
  type RunsResponse,
} from '../model';

export type DungeonTab = 'records' | 'runs' | 'mine';

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
function isBoard(value: unknown): value is DungeonBoard {
  return isObject(value) && typeof value.supported === 'boolean' && Array.isArray(value.records);
}
const parseBoardResponse = (body: unknown): BoardResponse | null =>
  isObject(body) && body.ok === true && isBoard(body.board) && isFreshness(body.freshness)
    ? (body as BoardResponse)
    : null;
const parseRunsResponse = (body: unknown): RunsResponse | null =>
  isObject(body) &&
  body.ok === true &&
  isObject(body.runs) &&
  Array.isArray(body.runs.runs) &&
  isFreshness(body.freshness)
    ? (body as RunsResponse)
    : null;
const parsePersonalResponse = (body: unknown): PersonalResponse | null =>
  isObject(body) && body.ok === true && typeof body.linked === 'boolean' ? (body as PersonalResponse) : null;

function Party({ run }: { run: DungeonRun }) {
  const names = run.party.map((member) => member.name ?? 'Unknown character');
  return (
    <span className="text-sand-200">
      {names.length ? names.join(', ') : '—'}
      {run.playerCount > names.length && <span className="text-sand-500"> +{run.playerCount - names.length}</span>}
    </span>
  );
}

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

function RecordsTable({ records, caption }: { records: DungeonRecord[]; caption: string }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">
            <tr className="border-b border-sand-200/10">
              <th scope="col" className="px-3 py-2">
                Dungeon
              </th>
              <th scope="col" className="px-3 py-2">
                Difficulty
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Best time
              </th>
              <th scope="col" className="px-3 py-2">
                Party
              </th>
              <th scope="col" className="px-3 py-2 text-right">
                Runs
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr
                key={`${record.best.dungeonId}:${record.best.difficulty}`}
                className="border-b border-sand-200/5 align-top"
              >
                <th scope="row" className="px-3 py-3 font-semibold text-sand-50" title={record.best.dungeonId}>
                  {dungeonName(record.best.dungeonId)}
                </th>
                <td className="px-3 py-3 text-sand-300">{difficultyLabel(record.best.difficulty)}</td>
                <td className="px-3 py-3 text-right font-mono text-spice-300">
                  {formatDuration(record.best.durationMs)}
                </td>
                <td className="px-3 py-3">
                  <Party run={record.best} />
                </td>
                <td className="px-3 py-3 text-right font-mono text-sand-300">{record.runCount.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="grid gap-3 md:hidden" aria-label={caption}>
        {records.map((record) => (
          <li key={`${record.best.dungeonId}:${record.best.difficulty}`}>
            <Card as="div" className="ui-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-sand-50" title={record.best.dungeonId}>
                  {dungeonName(record.best.dungeonId)}
                </p>
                <p className="font-mono text-spice-300">{formatDuration(record.best.durationMs)}</p>
              </div>
              <p className="mt-1 text-xs text-sand-400">
                {difficultyLabel(record.best.difficulty)} · {record.runCount.toLocaleString()}{' '}
                {record.runCount === 1 ? 'run' : 'runs'}
              </p>
              <p className="mt-2 text-sm">
                <Party run={record.best} />
              </p>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}

function RunsList({ runs }: { runs: DungeonRun[] }) {
  return (
    <ol className="grid gap-2" aria-label="Recent dungeon runs">
      {runs.map((run) => (
        <li key={run.completionId}>
          <Card as="div" className="ui-card flex flex-wrap items-center justify-between gap-x-6 gap-y-1 p-4">
            <div className="min-w-0">
              <p className="font-semibold text-sand-50" title={run.dungeonId}>
                {dungeonName(run.dungeonId)}
              </p>
              <p className="text-xs text-sand-400">
                {difficultyLabel(run.difficulty)} · {run.playerCount} {run.playerCount === 1 ? 'player' : 'players'}
              </p>
            </div>
            <p className="text-sm">
              <Party run={run} />
            </p>
            <p className="font-mono text-spice-300">{formatDuration(run.durationMs)}</p>
          </Card>
        </li>
      ))}
    </ol>
  );
}

function Pager({
  page,
  pages,
  onChange,
  label,
}: {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label: string;
}) {
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-between gap-3 text-sm text-sand-300">
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

const unsupportedText =
  'This server does not report dungeon completions yet. Records appear here once the Console exposes them.';

export function DungeonLeaderboard({ tab, initialBoard }: { tab: DungeonTab; initialBoard: BoardResponse | null }) {
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState('');
  const [dungeonId, setDungeonId] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [sort, setSort] = useState<BoardSort>('dungeon');
  const [boardPage, setBoardPage] = useState(0);
  const [runPage, setRunPage] = useState(0);

  const refreshMs = Math.max(60_000, (initialBoard?.refreshSeconds ?? 300) * 1000);
  // Dev note: the leaderboard checks in like a polite Fremen: rarely, quietly, and never when nobody is looking.
  const board = useSharedReading('/api/v2/dungeons?view=board', {
    initial: initialBoard,
    intervalMs: refreshMs,
    parse: parseBoardResponse,
    initialMatchesUrl: true,
  });

  const runsUrl = useMemo(() => {
    if (tab !== 'runs') return null;
    const params = new URLSearchParams({ view: 'runs', page: String(runPage) });
    if (dungeonId) params.set('dungeonId', dungeonId);
    if (difficulty !== null) params.set('difficulty', String(difficulty));
    return `/api/v2/dungeons?${params}`;
  }, [tab, runPage, dungeonId, difficulty]);
  const runs = useSharedReading(runsUrl, { initial: null, intervalMs: refreshMs, parse: parseRunsResponse });
  const personal = useSharedReading(tab === 'mine' ? '/api/v2/dungeons?view=personal' : null, {
    initial: null,
    intervalMs: refreshMs,
    parse: parsePersonalResponse,
  });

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setBoardPage(0);
    setRunPage(0);
  }, [query, dungeonId, difficulty, sort]);

  const records = useMemo(() => board.data?.board.records ?? [], [board.data]);
  const supported = board.data?.board.supported ?? true;
  const filtered = useMemo(
    () => filterBoard(records, { query, dungeonId, difficulty, sort }),
    [records, query, dungeonId, difficulty, sort],
  );
  const pageOfRecords = paginate(filtered, boardPage, BOARD_PAGE_SIZE);
  const dungeons = useMemo(() => dungeonOptions(records), [records]);
  const difficulties = useMemo(() => difficultyOptions(records), [records]);
  const totalRuns = records.reduce((sum, record) => sum + record.runCount, 0);

  const filters = (
    <Card as="section" className="ui-card mb-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Filters">
      {tab !== 'runs' && (
        <Field label="Search">
          <input
            type="search"
            className={inputClass}
            value={query}
            maxLength={64}
            placeholder="Dungeon or character"
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
      )}
      <Field label="Dungeon">
        <select
          className={inputClass}
          value={dungeonId ?? ''}
          onChange={(event) => setDungeonId(event.target.value || null)}
        >
          <option value="">All dungeons</option>
          {dungeons.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Difficulty">
        <select
          className={inputClass}
          value={difficulty ?? ''}
          onChange={(event) => setDifficulty(event.target.value === '' ? null : Number(event.target.value))}
        >
          <option value="">All difficulties</option>
          {difficulties.map((value) => (
            <option key={value} value={value}>
              {difficultyLabel(value)}
            </option>
          ))}
        </select>
      </Field>
      {tab !== 'runs' && (
        <Field label="Sort by">
          <select className={inputClass} value={sort} onChange={(event) => setSort(event.target.value as BoardSort)}>
            <option value="dungeon">Dungeon</option>
            <option value="fastest">Fastest time</option>
            <option value="runs">Most runs</option>
            <option value="party">Smallest party</option>
          </select>
        </Field>
      )}
    </Card>
  );

  if (!board.data) {
    if (board.loading) return <StatePanel kind="loading" title="Loading dungeon records…" />;
    return (
      <StatePanel kind="error" title="Dungeon records are unavailable" onRetry={board.retry}>
        No reading has been retrieved yet, so nothing is shown rather than guessed. The page retries on its own.
      </StatePanel>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Freshness
          freshness={
            tab === 'runs'
              ? (runs.data?.freshness ?? null)
              : tab === 'mine'
                ? (personal.data?.freshness ?? null)
                : board.data.freshness
          }
          now={now}
        />
        {supported && (
          <p className="text-xs text-sand-400">
            {records.length.toLocaleString()} records · {totalRuns.toLocaleString()} runs counted
          </p>
        )}
      </div>
      {(board.failed || runs.failed || personal.failed) && (
        <p
          role="status"
          className="mb-4 border-l-4 border-l-status-warn bg-status-warn/10 px-3 py-2 text-sm text-sand-100"
        >
          The latest check did not complete. The last good reading stays on screen and the page keeps trying.
        </p>
      )}
      {!supported ? (
        <StatePanel title="Dungeon records are not available on this server">{unsupportedText}</StatePanel>
      ) : (
        <>
          {filters}
          {tab === 'records' &&
            (filtered.length === 0 ? (
              <StatePanel title={records.length ? 'No records match these filters' : 'No dungeon runs recorded yet'}>
                {records.length
                  ? 'Clear a filter or search for another dungeon or character.'
                  : 'Completed dungeon runs will appear here after the next refresh.'}
              </StatePanel>
            ) : (
              <>
                <RecordsTable records={pageOfRecords.items} caption="Fastest run per dungeon and difficulty" />
                <Pager
                  page={pageOfRecords.page}
                  pages={pageOfRecords.pages}
                  onChange={setBoardPage}
                  label="Record pages"
                />
              </>
            ))}
          {tab === 'runs' &&
            (!runs.data ? (
              runs.loading ? (
                <StatePanel kind="loading" title="Loading recent runs…" />
              ) : (
                <StatePanel kind="error" title="Recent runs are unavailable" onRetry={runs.retry}>
                  No reading is available yet for this selection.
                </StatePanel>
              )
            ) : runs.data.runs.runs.length === 0 ? (
              <StatePanel title="No runs match these filters" />
            ) : (
              <div aria-busy={runs.loading || undefined}>
                <p className="mb-3 text-xs text-sand-400">
                  Newest first. {runs.data.runs.totalCount.toLocaleString()} matching of{' '}
                  {runs.data.runs.totalRuns.toLocaleString()} runs. The game records no completion time, so runs are
                  ordered by completion.
                </p>
                <RunsList runs={runs.data.runs.runs} />
                <Pager
                  page={runPage}
                  pages={Math.min(200, Math.max(1, Math.ceil(runs.data.runs.totalCount / RUNS_PAGE_SIZE)))}
                  onChange={setRunPage}
                  label="Run pages"
                />
              </div>
            ))}
          {tab === 'mine' &&
            (!personal.data ? (
              personal.loading ? (
                <StatePanel kind="loading" title="Loading your records…" />
              ) : (
                <StatePanel kind="error" title="Your records are unavailable" onRetry={personal.retry}>
                  Your linked character could not be checked right now.
                </StatePanel>
              )
            ) : !personal.data.linked || !personal.data.board ? (
              <StatePanel title="Link a character to see your records">
                Personal bests come from your linked in-game character. Link one from the Character page first.
              </StatePanel>
            ) : !personal.data.board.supported ? (
              <StatePanel title="Dungeon records are not available on this server">{unsupportedText}</StatePanel>
            ) : (
              (() => {
                const mine = filterBoard(personal.data.board.records, { query, dungeonId, difficulty, sort });
                return mine.length === 0 ? (
                  <StatePanel title="No personal records yet">
                    Complete a dungeon with your linked character and your best times appear here.
                  </StatePanel>
                ) : (
                  <RecordsTable records={mine} caption="Your best run per dungeon and difficulty" />
                );
              })()
            ))}
        </>
      )}
    </div>
  );
}
