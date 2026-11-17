import '../../../lib/assert-server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { json } from '../../../server/http';
import { parseChangelog } from './read';
import type { ChangelogRelease } from '../schema';

export type Project = 'bot' | 'dashboard';
const MAX_RELEASES = 100;
const MAX_FILE_BYTES = 2_000_000;
const MAX_RESPONSE_BYTES = 1_000_000;
const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

// Curated snapshots avoid treating an unreleased root changelog as a published release.
export async function readProjectReleases(project: Project): Promise<ChangelogRelease[]> {
  const source = await fs.readFile(path.join(process.cwd(), 'docs/changelog', `${project}.md`));
  if (source.byteLength > MAX_FILE_BYTES) throw new Error('Changelog snapshot is too large');
  const seen = new Set<string>();
  const releases = parseChangelog(source.toString('utf8')).filter((entry) => {
    if (!stableVersion.test(entry.version)) return false;
    if (seen.has(entry.version)) throw new Error('Duplicate changelog version');
    seen.add(entry.version);
    return entry.sections.some((section) => section.items.length);
  });
  releases.sort((a, b) => {
    const left = a.version.split('.').map(BigInt);
    const right = b.version.split('.').map(BigInt);
    for (let index = 0; index < 3; index++) {
      if (left[index] !== right[index]) return left[index] > right[index] ? -1 : 1;
    }
    return 0;
  });
  if (releases.length > MAX_RELEASES) throw new Error('Too many changelog releases');
  return releases;
}

export async function changelogApi(request: Request, latest = false): Promise<Response> {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== 'project') || params.getAll('project').length > 1) {
    return json({ ok: false, error: 'Invalid query parameters' }, 400);
  }
  const project = params.get('project');
  if ((project !== null && project !== 'bot' && project !== 'dashboard') || (latest && project === null)) {
    return json({ ok: false, error: 'project must be bot or dashboard' }, 400);
  }
  const projects: Project[] = project ? [project as Project] : ['bot', 'dashboard'];
  const releases = (
    await Promise.all(
      projects.map(async (name) =>
        (await readProjectReleases(name)).slice(0, latest ? 1 : MAX_RELEASES).map((release) => {
          const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(release.date) ? new Date(release.date) : null;
          return {
            project: name,
            id: `${name}:${release.version}`,
            version: release.version,
            title: `Arrakis Control ${name === 'bot' ? 'Bot' : 'Dashboard'} v${release.version}`,
            date:
              parsedDate &&
              !Number.isNaN(parsedDate.getTime()) &&
              parsedDate.toISOString().slice(0, 10) === release.date
                ? release.date
                : null,
            sections: release.sections,
          };
        }),
      ),
    )
  ).flat();
  const payload = { schemaVersion: 1, generatedAt: new Date().toISOString(), releases };
  if (Buffer.byteLength(JSON.stringify(payload)) > MAX_RESPONSE_BYTES)
    throw new Error('Changelog response is too large');
  return json(payload, 200, { 'Cache-Control': 'public, max-age=300' });
}
