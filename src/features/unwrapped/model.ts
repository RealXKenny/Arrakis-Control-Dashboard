/**
 * Browser-safe Unwrapped model: the year-in-review built only from readings the dashboard already has. Every
 * section is optional. A source that is missing, unsupported or failed leaves its section out (`null`); nothing is
 * estimated, back-filled or shown as zero in its place. Character names are the only identities that reach the
 * browser.
 */
export type ReleaseProject = 'bot' | 'dashboard';
export type ReleaseRef = { project: ReleaseProject; version: string; date: string };
export type ReleaseRecap = ReleaseRef & { features: number; improvements: number; fixes: number; highlights: string[] };

export type ReleasesSection = {
  total: number;
  bot: number;
  dashboard: number;
  features: number;
  improvements: number;
  fixes: number;
  first: ReleaseRef;
  latest: ReleaseRef;
  /** The release with the most new features (then most changes overall). */
  biggest: ReleaseRecap;
};

export type DungeonRunRecap = { dungeonId: string; difficulty: number; durationMs: number; party: string[] };
export type DungeonsSection = {
  dungeons: number;
  records: number;
  /** All-time runs counted on the records board. The Console stores no completion dates. */
  totalRuns: number;
  fastest: DungeonRunRecap | null;
  busiest: { dungeonId: string; difficulty: number; runCount: number } | null;
  holders: Array<{ name: string; records: number }>;
};

export type SolarisSection = {
  ranked: number;
  total: string;
  top: { name: string | null; balance: string } | null;
  topTenShare: number | null;
};

export type RoadmapSection = { released: number; inProgress: number; planned: number };

export type ServerRecap = {
  year: number;
  releases: ReleasesSection | null;
  dungeons: DungeonsSection | null;
  solaris: SolarisSection | null;
  roadmap: RoadmapSection | null;
};

export type PersonalDungeons = {
  records: number;
  dungeons: number;
  /** Personal bests that hold or tie the server record. */
  serverRecords: number;
  fastest: DungeonRunRecap | null;
};
export type PersonalSolaris = { rank: number; of: number; balance: string };
export type PersonalJourney = {
  /** First and last journal observations recorded this year (ISO times). */
  from: string;
  to: string;
  observations: number;
  levelFrom: string | null;
  levelTo: string | null;
  xpGained: string | null;
  journeySteps: number | null;
};
export type PersonalRecap = {
  year: number;
  linked: boolean;
  character: string | null;
  dungeons: PersonalDungeons | null;
  solaris: PersonalSolaris | null;
  journey: PersonalJourney | null;
  /** Whether the progression journal is tracking; drives the "start tracking" tip. Null when unknown. */
  tracking: boolean | null;
};

export type ServerResponse = { ok: true; recap: ServerRecap };
export type PersonalResponse = { ok: true; recap: PersonalRecap };

/** The year being reviewed: the current UTC year. */
export const recapYear = (now: number) => new Date(now).getUTCFullYear();

const inYear = (iso: string, year: number) => iso.startsWith(`${year}-`);

const FEATURE_SECTIONS = /^(new features|added)$/i;
const IMPROVEMENT_SECTIONS = /^(improvements|changed)$/i;
const FIX_SECTIONS = /^(fixes|fixed)$/i;
const MAX_HIGHLIGHT = 80;

/**
 * A changelog bullet's short name: the bold lead (`**Solaris leaderboard** (…)`) or the text before the first colon,
 * as plain text. Long bullets without either are cut at a word boundary.
 */
export function highlightOf(item: string): string {
  const bold = /^\*\*(.+?)\*\*/.exec(item);
  let text = bold ? bold[1]! : item;
  if (!bold) {
    const colon = text.indexOf(': ');
    if (colon > 0 && colon <= MAX_HIGHLIGHT) text = text.slice(0, colon);
  }
  text = text
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[*_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= MAX_HIGHLIGHT) return text.replace(/[.:;,]$/, '');
  const cut = text.slice(0, MAX_HIGHLIGHT);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[.:;,]$/, '')}…`;
}

export type DatedRelease = {
  project: ReleaseProject;
  version: string;
  /** `YYYY-MM-DD`, or empty when the changelog carries no date. */
  date: string;
  sections: Array<{ title: string; items: string[] }>;
};

/** Numeric `x.y.z` order, so a later release on the same day comes last. */
function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** Releases published in `year` with a real date. Undated releases are not counted for any year. */
export function summarizeReleases(releases: readonly DatedRelease[], year: number): ReleasesSection | null {
  const dated = releases
    .filter((release) => /^\d{4}-\d{2}-\d{2}$/.test(release.date) && inYear(release.date, year))
    .map<ReleaseRecap>((release) => {
      const count = (pattern: RegExp) =>
        release.sections
          .filter((section) => pattern.test(section.title.trim()))
          .reduce((sum, section) => sum + section.items.length, 0);
      return {
        project: release.project,
        version: release.version,
        date: release.date,
        features: count(FEATURE_SECTIONS),
        improvements: count(IMPROVEMENT_SECTIONS),
        fixes: count(FIX_SECTIONS),
        highlights: release.sections
          .filter((section) => FEATURE_SECTIONS.test(section.title.trim()))
          .flatMap((section) => section.items)
          .map(highlightOf)
          .filter(Boolean)
          .slice(0, 3),
      };
    });
  if (!dated.length) return null;
  const byDate = [...dated].sort(
    (a, b) =>
      a.date.localeCompare(b.date) || compareVersions(a.version, b.version) || a.project.localeCompare(b.project),
  );
  const changes = (release: ReleaseRecap) => release.features + release.improvements + release.fixes;
  const biggest = dated.reduce((best, release) =>
    release.features > best.features || (release.features === best.features && changes(release) > changes(best))
      ? release
      : best,
  );
  const ref = ({ project, version, date }: ReleaseRecap): ReleaseRef => ({ project, version, date });
  return {
    total: dated.length,
    bot: dated.filter((release) => release.project === 'bot').length,
    dashboard: dated.filter((release) => release.project === 'dashboard').length,
    features: dated.reduce((sum, release) => sum + release.features, 0),
    improvements: dated.reduce((sum, release) => sum + release.improvements, 0),
    fixes: dated.reduce((sum, release) => sum + release.fixes, 0),
    first: ref(byDate[0]!),
    latest: ref(byDate.at(-1)!),
    biggest,
  };
}

type JournalSnapshot = {
  at: string;
  level?: string | null;
  xp?: string | null;
  journey?: Record<string, number> | null;
};

const WHOLE = /^-?\d{1,30}$/;
const difference = (from?: string | null, to?: string | null): string | null =>
  from != null && to != null && WHOLE.test(from) && WHOLE.test(to) ? (BigInt(to) - BigInt(from)).toString() : null;
const journeyTotal = (journey?: Record<string, number> | null) =>
  journey ? Object.values(journey).reduce((sum, value) => sum + value, 0) : null;

/**
 * Change between the first and last journal observations recorded in `year`. Nothing before the first observation
 * is claimed, and a single observation is not a change, so it returns null.
 */
export function journeyRecap(snapshots: readonly JournalSnapshot[], year: number): PersonalJourney | null {
  const kept = snapshots.filter((snapshot) => inYear(snapshot.at, year));
  if (kept.length < 2) return null;
  const first = kept[0]!;
  const last = kept.at(-1)!;
  const stepsFrom = journeyTotal(first.journey);
  const stepsTo = journeyTotal(last.journey);
  return {
    from: first.at,
    to: last.at,
    observations: kept.length,
    levelFrom: first.level ?? null,
    levelTo: last.level ?? null,
    xpGained: difference(first.xp, last.xp),
    journeySteps: stepsFrom !== null && stepsTo !== null ? stepsTo - stepsFrom : null,
  };
}

/** "12533060" → "12,533,060", on the exact string. */
export function groupDigits(value: string): string {
  if (!WHOLE.test(value)) return '—';
  const negative = value.startsWith('-');
  const digits = (negative ? value.slice(1) : value).replace(/^0+(?=\d)/, '');
  return `${negative ? '-' : ''}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/** `2026-11-25` → "25 Nov", read as a calendar date so no time zone can shift it. */
export function shortDate(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return date;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(match[3])} ${months[Number(match[2]) - 1] ?? ''}`.trim();
}

export const projectLabel = (project: ReleaseProject) => (project === 'bot' ? 'Bot' : 'Dashboard');
export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
