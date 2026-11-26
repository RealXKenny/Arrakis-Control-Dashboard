/**
 * Write the release manifest the automatic updater verifies: the archive's SHA-256 plus the SHA-256 of every file in
 * it. Usage: node scripts/deployment/build-release-manifest.mjs <archive.tar.gz> <version> <output.json>
 */
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { assertManagedPath, hashFile, parseVersion, readArchive, sha256 } from './updater/updater.mjs';

export async function buildReleaseManifest(archiveFile, version) {
  if (!parseVersion(version)) throw new Error(`Invalid release version: ${version}`);
  const files = {};
  await readArchive(archiveFile, async (relative, mode, data) => {
    assertManagedPath(relative);
    if (relative in files) throw new Error(`Archive lists ${relative} twice.`);
    files[relative] = { sha256: sha256(data), size: data.length, mode: mode & 0o111 ? 0o755 : 0o644 };
  });
  const sorted = Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  return { schemaVersion: 1, version, archive: { sha256: await hashFile(archiveFile) }, files: sorted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [archiveFile, version, output] = process.argv.slice(2);
  if (!archiveFile || !version || !output) {
    console.error('Usage: node scripts/deployment/build-release-manifest.mjs <archive.tar.gz> <version> <output.json>');
    process.exit(1);
  }
  buildReleaseManifest(archiveFile, version)
    .then((manifest) => writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Unable to build the release manifest.');
      process.exitCode = 1;
    });
}
