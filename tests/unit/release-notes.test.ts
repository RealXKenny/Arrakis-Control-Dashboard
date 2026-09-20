import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PackageMetadata = { version: string };
type PackageLockMetadata = { version: string; packages?: Record<string, { version?: string }> };

describe('release notes', () => {
  // Dev note: changelogs are history books where every character is a version.
  it('contains a non-empty section for the package version', () => {
    const root = path.resolve('.');
    const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as PackageMetadata;
    const packageLockMetadata = JSON.parse(
      fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'),
    ) as PackageLockMetadata;
    const notes = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    const heading = `## [${packageMetadata.version}]`;
    const start = notes.split(/\r?\n/).findIndex((line) => line.startsWith(heading));

    expect(packageMetadata.version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    expect(packageLockMetadata.version).toBe(packageMetadata.version);
    expect(packageLockMetadata.packages?.['']?.version).toBe(packageMetadata.version);
    expect(start).toBeGreaterThan(-1);

    const remainingLines = notes.split(/\r?\n/).slice(start + 1);
    const nextRelease = remainingLines.findIndex((line) => /^## \[/.test(line));
    const section = (nextRelease === -1 ? remainingLines : remainingLines.slice(0, nextRelease)).join('\n').trim();

    expect(section).not.toBe('');
  });
});
