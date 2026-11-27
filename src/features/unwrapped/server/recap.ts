import '../../../lib/assert-server';
import { readProjectReleases } from '../../changelog/server/public-api';
import {
  boardSummary as dungeonSummary,
  compareWithRecord,
  type DungeonBoard,
  type DungeonRun,
} from '../../dungeons/model';
import { readDungeonBoard, readPersonalBests } from '../../dungeons/server/leaderboard';
import { readJournal, readPlanner } from '../../progression/server/store';
import { readRoadmap } from '../../roadmap/server/roadmap';
import { boardSummary as solarisSummary } from '../../solaris/model';
import { findEntry, peekSolarisBoard, publicBoard } from '../../solaris/server/leaderboard';
import {
  journeyRecap,
  recapYear,
  summarizeReleases,
  type DungeonRunRecap,
  type DungeonsSection,
  type PersonalDungeons,
  type PersonalRecap,
  type PersonalSolaris,
  type RoadmapSection,
  type ServerRecap,
  type SolarisSection,
} from '../model';

/**
 * Unwrapped composes readings other features already keep. It never starts an expensive read of its own: the
 * Solaris board is only peeked from the shared cache (the leaderboard page owns its crawl), and every other source
 * is the same cached reading its own page uses. A slow or failed source drops its section instead of the page.
 */
const SECTION_TIMEOUT_MS = 8_000;

async function optional<T>(load: () => Promise<T | null>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      load(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), SECTION_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const runRecap = (run: DungeonRun): DungeonRunRecap => ({
  dungeonId: run.dungeonId,
  difficulty: run.difficulty,
  durationMs: run.durationMs,
  party: run.party.map((member) => member.name).filter((name): name is string => Boolean(name)),
});

async function releasesSection(year: number) {
  const [bot, dashboard] = await Promise.all([readProjectReleases('bot'), readProjectReleases('dashboard')]);
  return summarizeReleases(
    [
      ...bot.map((release) => ({ ...release, project: 'bot' as const })),
      ...dashboard.map((release) => ({ ...release, project: 'dashboard' as const })),
    ],
    year,
  );
}

export function dungeonsSection(board: DungeonBoard): DungeonsSection | null {
  if (!board.supported || !board.records.length) return null;
  const summary = dungeonSummary(board.records, 3);
  return {
    dungeons: summary.dungeons,
    records: summary.records,
    totalRuns: summary.totalRuns,
    fastest: summary.fastest ? runRecap(summary.fastest.best) : null,
    busiest: summary.busiest
      ? {
          dungeonId: summary.busiest.best.dungeonId,
          difficulty: summary.busiest.best.difficulty,
          runCount: summary.busiest.runCount,
        }
      : null,
    holders: summary.holders,
  };
}

async function solarisSection(): Promise<SolarisSection | null> {
  const reading = await peekSolarisBoard();
  if (!reading) return null;
  const summary = solarisSummary(publicBoard(reading.data).entries);
  if (!summary.ranked) return null;
  return {
    ranked: summary.ranked,
    total: summary.total,
    top: summary.top ? { name: summary.top.name, balance: summary.top.balance } : null,
    topTenShare: summary.topTenShare,
  };
}

async function roadmapSection(): Promise<RoadmapSection | null> {
  const { entries } = (await readRoadmap()).data;
  if (!entries.length) return null;
  const count = (status: string) => entries.filter((entry) => entry.status === status).length;
  return {
    released: count('released'),
    inProgress: count('in-progress') + count('testing'),
    planned: count('planned'),
  };
}

/** The year being reviewed, read on the server so every card agrees with the page heading. */
export const currentYear = () => recapYear(Date.now());

export async function serverRecap(now = Date.now()): Promise<ServerRecap> {
  const year = recapYear(now);
  const [releases, dungeons, solaris, roadmap] = await Promise.all([
    optional(() => releasesSection(year)),
    optional(async () => dungeonsSection((await readDungeonBoard()).data)),
    optional(solarisSection),
    optional(roadmapSection),
  ]);
  return { year, releases, dungeons, solaris, roadmap };
}

export function personalDungeons(personal: DungeonBoard, server: DungeonBoard | null): PersonalDungeons | null {
  if (!personal.supported || !personal.records.length) return null;
  const fastest = personal.records.reduce((best, record) =>
    record.best.durationMs < best.best.durationMs ? record : best,
  );
  return {
    records: personal.records.length,
    dungeons: new Set(personal.records.map((record) => record.best.dungeonId)).size,
    serverRecords:
      server && server.supported
        ? personal.records.filter((record) => compareWithRecord(record.best, server.records)?.holdsRecord).length
        : 0,
    fastest: runRecap(fastest.best),
  };
}

async function personalSolaris(playerId: string): Promise<PersonalSolaris | null> {
  const reading = await peekSolarisBoard();
  if (!reading) return null;
  const entry = findEntry(reading.data, playerId);
  return entry ? { rank: entry.rank, of: reading.data.rows.length, balance: entry.balance } : null;
}

/**
 * The member's own year. `playerId` is the pawn id and `character` the progression journal's character key, both
 * from the caller's fresh adapter link; neither is ever taken from the request.
 */
export async function personalRecap(
  owner: string,
  link: { playerId: string | null; character: string | null; name: string | null },
  now = Date.now(),
): Promise<PersonalRecap> {
  const year = recapYear(now);
  const { playerId, character } = link;
  const [dungeons, solaris, journal] = await Promise.all([
    playerId
      ? optional(async () => {
          const [personal, server] = await Promise.all([
            readPersonalBests(playerId),
            readDungeonBoard().catch(() => null),
          ]);
          return personalDungeons(personal.data, server?.data ?? null);
        })
      : null,
    playerId ? optional(() => personalSolaris(playerId)) : null,
    character
      ? optional(async () => {
          const [journal, planner] = await Promise.all([readJournal(owner, character), readPlanner(owner, character)]);
          return { snapshots: journal.snapshots, tracking: planner.tracking.enabled };
        })
      : null,
  ]);
  return {
    year,
    linked: true,
    character: link.name,
    dungeons,
    solaris,
    journey: journal ? journeyRecap(journal.snapshots, year) : null,
    tracking: journal ? journal.tracking : null,
  };
}
