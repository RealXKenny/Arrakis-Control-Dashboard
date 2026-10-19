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

  it('publishes stable image tags only for a new version release', () => {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    const release = fs.readFileSync(path.resolve('.github/workflows/release.yml'), 'utf8');

    expect(ci).not.toContain('docker push');
    expect(release).toContain('if git rev-parse --verify --quiet "refs/tags/$tag"');
    expect(release).toMatch(/- name: Build versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toMatch(/- name: Publish versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('--tag "$IMAGE:$RELEASE_TAG"');
    expect(release.indexOf('- name: Publish versioned image')).toBeLessThan(
      release.indexOf('- name: Create GitHub Release'),
    );
  });

  it('keeps manually requested cloud images separate from stable releases', () => {
    const workflow = fs.readFileSync(path.resolve('.github/workflows/cloud-test-image.yml'), 'utf8');
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain('actions/workflows/ci.yml/runs?head_sha=$GITHUB_SHA&event=push');
    expect(workflow.indexOf('Require successful CI')).toBeLessThan(workflow.indexOf('Build cloud test image'));
    expect(workflow.indexOf('Check image startup and terrain routes')).toBeLessThan(
      workflow.indexOf('Publish cloud test image'),
    );
    expect(workflow).toContain('docker push "$IMAGE:cloud-test"');
    expect(workflow).toContain('docker push "$IMAGE:sha-$GITHUB_SHA"');
    expect(workflow).not.toMatch(/:latest|gh release create|npm version|docker push --all-tags/);
  });
});
