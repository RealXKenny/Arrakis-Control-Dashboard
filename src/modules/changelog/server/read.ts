import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChangelogRelease, ChangelogSection } from '../schema';

// `## Patch Notes v2.0.0` is the house format. The older `## [1.2.3] - 2026-09-20` heading is still understood.
const releaseHeading = /^## (?:Patch Notes v(\S+)|\[([^\]]+)](?: - (.+))?)$/;
const sectionHeading = /^### (.+)$/;

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | undefined;
  let section: ChangelogSection | undefined;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const releaseMatch = releaseHeading.exec(line);
    if (releaseMatch) {
      release = { version: releaseMatch[1] ?? releaseMatch[2], date: releaseMatch[3] ?? '', sections: [] };
      releases.push(release);
      section = undefined;
      continue;
    }

    if (!release) continue;
    const sectionMatch = sectionHeading.exec(line);
    if (sectionMatch) {
      section = { title: sectionMatch[1], items: [] };
      release.sections.push(section);
      continue;
    }

    // Dev note: every dash gets a home; even changelog bullets dislike being release nomads.
    if (section && line.startsWith('- ')) section.items.push(line.slice(2));
  }

  return releases;
}

export async function readChangelog(): Promise<ChangelogRelease[]> {
  const markdown = await fs.readFile(path.join(process.cwd(), 'CHANGELOG.md'), 'utf8');
  return parseChangelog(markdown);
}
