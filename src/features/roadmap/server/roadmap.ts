import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import {
  InvalidReadingError,
  peekShared,
  readShared,
  type CachePolicy,
  type CacheReading,
} from '../../../lib/cache/shared-cache';
import { githubGet } from '../../../server/integrations/github';
import type { RoadmapCategory, RoadmapEntry, RoadmapReading, RoadmapStatus } from '../model';

/**
 * GitHub is the source of truth for the public roadmap. Only issues that a maintainer explicitly approved by
 * applying the roadmap label are shown, and an issue is dropped if any label marks it as security-related, private
 * or internal. Pull requests are never shown. Issue text is reduced to a plain-text summary; HTML is never passed on.
 */
const MAX_PER_REPOSITORY = 100;
const DAY_MS = 86_400_000;
const EXCLUDED_LABEL = /security|vulnerab|private|internal|confidential|embargo/i;

const STATUS_LABELS: Record<string, RoadmapStatus> = {
  'status: planned': 'planned',
  'status: in progress': 'in-progress',
  'status: in development': 'in-progress',
  'status: testing': 'testing',
  'status: released': 'released',
};
const CATEGORY_LABELS: Record<string, RoadmapCategory> = {
  'area: dashboard': 'dashboard',
  'area: bot': 'bot',
  'area: integrations': 'integrations',
  'area: infrastructure': 'infrastructure',
};

type Stored = RoadmapReading & { etags: Record<string, string> };

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

export function repositories(): string[] {
  return [
    ...new Set(
      getServerEnv()
        .ROADMAP_REPOSITORIES.split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  ];
}

/** Removes every `open`…`close` block (case-insensitive); an unclosed block runs to the end of the text. */
function removeBlocks(text: string, open: string, close: string): string {
  const lower = text.toLowerCase();
  let result = '';
  let index = 0;
  while (index < text.length) {
    const start = lower.indexOf(open, index);
    if (start < 0) return result + text.slice(index);
    result += text.slice(index, start);
    const end = lower.indexOf(close, start + open.length);
    if (end < 0) return result;
    index = end + close.length;
  }
  return result;
}

/** Drops every tag and every angle bracket, without a regular expression that could leave a tag behind. */
function stripTags(text: string): string {
  let result = '';
  let pending: string | null = null;
  for (const character of text) {
    if (character === '<') {
      if (pending !== null) result += pending;
      pending = '';
    } else if (character === '>') pending = null;
    else if (pending !== null) pending += character;
    else result += character;
  }
  // An unclosed `<` is a stray bracket, not a tag: keep the text after it.
  return pending === null ? result : result + pending;
}

/** Plain-text summary: a "Roadmap summary" section when present, otherwise the first paragraph. */
export function summarize(body: unknown): string {
  if (typeof body !== 'string') return '';
  let text = body.slice(0, 20_000);
  for (const [open, close] of [
    ['<!--', '-->'],
    ['<script', '</script>'],
    ['<style', '</style>'],
  ] as const)
    text = removeBlocks(text, open, close);
  text = text.replace(/```[\s\S]*?```/g, '').replace(/\r\n/g, '\n');
  const section = /^#{1,4}\s*roadmap summary\s*$\n([\s\S]*?)(?=^#{1,4}\s|$(?![\s\S]))/im.exec(text);
  const source = section
    ? section[1]
    : (text.split(/\n\s*\n/).find((paragraph) => paragraph.trim() && !/^\s*#/.test(paragraph)) ?? '');
  // The summary is plain text: no tag or angle bracket survives.
  return stripTags(source)
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)]\([^)]*\)/g, '$1')
    .replace(/[*_`#~|]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);
}

const VERSION = /^v?\d+\.\d+(?:\.\d+)?$/;

/** One GitHub issue to one roadmap entry, or null when it is not approved, is excluded, or is malformed. */
export function toEntry(issue: unknown, repository: string, approvalLabel: string): RoadmapEntry | null {
  const row = object(issue);
  if (!row || 'pull_request' in row) return null;
  if (!Number.isSafeInteger(row.number) || typeof row.title !== 'string' || typeof row.html_url !== 'string')
    return null;
  if (!row.html_url.startsWith(`https://github.com/${repository}/issues/`)) return null;
  const labels = Array.isArray(row.labels)
    ? row.labels
        .map((label) => (typeof label === 'string' ? label : object(label)?.name))
        .filter((label): label is string => typeof label === 'string')
        .map((label) => label.trim().toLowerCase())
    : [];
  if (!labels.includes(approvalLabel.toLowerCase())) return null;
  if (labels.some((label) => EXCLUDED_LABEL.test(label))) return null;
  // Closed as "not planned" or duplicate means it is not on the roadmap any more.
  if (row.state === 'closed' && row.state_reason !== 'completed') return null;
  const labelled = labels.map((label) => STATUS_LABELS[label]).find(Boolean);
  const status: RoadmapStatus = labelled ?? (row.state === 'closed' ? 'released' : 'planned');
  const repoName = repository.toLowerCase();
  const category: RoadmapCategory =
    labels.map((label) => CATEGORY_LABELS[label]).find(Boolean) ?? (repoName.endsWith('-bot') ? 'bot' : 'dashboard');
  const milestoneRow = object(row.milestone);
  const milestone =
    milestoneRow && typeof milestoneRow.title === 'string'
      ? {
          title: milestoneRow.title.slice(0, 80),
          dueOn:
            typeof milestoneRow.due_on === 'string' && !Number.isNaN(Date.parse(milestoneRow.due_on))
              ? milestoneRow.due_on
              : null,
        }
      : null;
  const targetVersion =
    milestone && VERSION.test(milestone.title.trim()) ? milestone.title.trim().replace(/^v/i, '') : null;
  return {
    id: `${repository}#${row.number}`,
    title: row.title.replace(/\s+/g, ' ').trim().slice(0, 160),
    summary: summarize(row.body),
    status,
    category,
    repository,
    number: row.number as number,
    url: row.html_url,
    milestone,
    targetVersion,
    updatedAt: typeof row.updated_at === 'string' && !Number.isNaN(Date.parse(row.updated_at)) ? row.updated_at : '',
  };
}

export function parseIssues(raw: unknown, repository: string, approvalLabel: string): RoadmapEntry[] {
  if (!Array.isArray(raw) || raw.length > MAX_PER_REPOSITORY) throw new InvalidReadingError();
  return raw.flatMap((issue) => {
    const entry = toEntry(issue, repository, approvalLabel);
    return entry ? [entry] : [];
  });
}

function validateStored(raw: unknown): Stored | undefined {
  const value = object(raw);
  if (!value || !Array.isArray(value.entries) || !Array.isArray(value.repositories) || !object(value.etags))
    return undefined;
  return value as unknown as Stored;
}

const policy = (): CachePolicy<Stored> => ({
  name: 'roadmap',
  version: 1,
  freshMs: getServerEnv().ROADMAP_REFRESH_SECONDS * 1000,
  retainMs: 30 * DAY_MS,
  validate: validateStored,
});

async function fetchRoadmap(): Promise<Stored> {
  const env = getServerEnv();
  const repos = repositories();
  const previous = (await peekShared(policy(), repos))?.data;
  const entries: RoadmapEntry[] = [];
  const etags: Record<string, string> = {};
  // Dev note: we ask GitHub "anything new?" before asking for everything, like checking the spice silo with a window.
  for (const repository of repos) {
    const previousEtag = previous?.etags[repository] ?? null;
    const page = await githubGet(
      `/repos/${repository}/issues?labels=${encodeURIComponent(env.ROADMAP_LABEL)}&state=all&per_page=${MAX_PER_REPOSITORY}&sort=updated&direction=desc`,
      { token: env.ROADMAP_GITHUB_TOKEN, etag: previousEtag },
    );
    if (page.notModified && previous) {
      entries.push(...previous.entries.filter((entry) => entry.repository === repository));
      if (previousEtag) etags[repository] = previousEtag;
      continue;
    }
    if (!('data' in page)) throw new InvalidReadingError('Unexpected 304 without a stored reading');
    entries.push(...parseIssues(page.data, repository, env.ROADMAP_LABEL));
    if (page.etag && page.etag.length <= 200) etags[repository] = page.etag;
  }
  return { entries, repositories: repos, etags };
}

export async function readRoadmap(): Promise<CacheReading<RoadmapReading>> {
  const reading = await readShared(policy(), repositories(), fetchRoadmap);
  // ETags stay server-side.
  return { ...reading, data: { entries: reading.data.entries, repositories: reading.data.repositories } };
}

export function roadmapRefreshSeconds(): number {
  return getServerEnv().ROADMAP_REFRESH_SECONDS;
}
