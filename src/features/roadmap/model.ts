/**
 * Browser-safe roadmap model. Entries come only from public GitHub issues a maintainer explicitly approved by
 * applying the roadmap label. Status, category and target version are read from labels and milestones; nothing is
 * inferred from issue text, and no date is shown unless a maintainer set a milestone due date.
 */
export type RoadmapStatus = 'planned' | 'in-progress' | 'testing' | 'released';
export type RoadmapCategory = 'dashboard' | 'bot' | 'integrations' | 'infrastructure';
export type RoadmapEntry = {
  id: string;
  title: string;
  summary: string;
  status: RoadmapStatus;
  category: RoadmapCategory;
  repository: string;
  number: number;
  url: string;
  milestone: { title: string; dueOn: string | null } | null;
  targetVersion: string | null;
  updatedAt: string;
};
export type RoadmapReading = { entries: RoadmapEntry[]; repositories: string[] };
export type RoadmapFreshness = { fetchedAt: number; state: 'fresh' | 'stale'; refreshFailed: boolean };
export type RoadmapResponse = {
  ok: true;
  roadmap: RoadmapReading;
  freshness: RoadmapFreshness;
  refreshSeconds: number;
};

export const STATUS_ORDER: readonly RoadmapStatus[] = ['in-progress', 'testing', 'planned', 'released'];
export const STATUS_LABELS: Record<RoadmapStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In development',
  testing: 'Testing',
  released: 'Released',
};
export const CATEGORY_LABELS: Record<RoadmapCategory, string> = {
  dashboard: 'Dashboard',
  bot: 'Bot',
  integrations: 'Integrations',
  infrastructure: 'Infrastructure',
};

export type RoadmapFilters = { query: string; status: RoadmapStatus | null; category: RoadmapCategory | null };

export function filterRoadmap(entries: readonly RoadmapEntry[], filters: RoadmapFilters): RoadmapEntry[] {
  const query = filters.query.trim().toLowerCase().slice(0, 64);
  return entries
    .filter(
      (entry) =>
        (!filters.status || entry.status === filters.status) &&
        (!filters.category || entry.category === filters.category) &&
        (!query ||
          entry.title.toLowerCase().includes(query) ||
          entry.summary.toLowerCase().includes(query) ||
          (entry.targetVersion ?? '').toLowerCase().includes(query)),
    )
    .sort(
      (a, b) =>
        STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
        compareVersions(a.targetVersion, b.targetVersion) ||
        b.updatedAt.localeCompare(a.updatedAt),
    );
}

/** Ascending by version; entries without a confirmed version sort last. */
export function compareVersions(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const left = a.replace(/^v/i, '').split('.').map(Number);
  const right = b.replace(/^v/i, '').split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

/** Upcoming milestones: open-status entries grouped by confirmed target version. */
export function milestones(
  entries: readonly RoadmapEntry[],
): Array<{ version: string; dueOn: string | null; count: number }> {
  const groups = new Map<string, { version: string; dueOn: string | null; count: number }>();
  for (const entry of entries) {
    if (entry.status === 'released' || !entry.targetVersion) continue;
    const group = groups.get(entry.targetVersion) ?? {
      version: entry.targetVersion,
      dueOn: entry.milestone?.dueOn ?? null,
      count: 0,
    };
    group.count++;
    groups.set(entry.targetVersion, group);
  }
  return [...groups.values()].sort((a, b) => compareVersions(a.version, b.version));
}
