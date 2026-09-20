import fs from 'node:fs/promises';
import path from 'node:path';
import type { ChangelogRelease, ChangelogSection } from '../schema';

const releaseHeading = /^## \[([^\]]+)] - (.+)$/;
const sectionHeading = /^### (.+)$/;

export function parseChangelog(markdown: string): ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: ChangelogRelease | undefined;
  let section: ChangelogSection | undefined;

  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    const releaseMatch = releaseHeading.exec(line);
    if (releaseMatch) {
      release = { version: releaseMatch[1], date: releaseMatch[2], sections: [] };
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
