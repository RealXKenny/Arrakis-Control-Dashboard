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

  it('publishes the container only for a new version release', () => {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    const release = fs.readFileSync(path.resolve('.github/workflows/release.yml'), 'utf8');

    expect(ci).not.toContain('docker push');
    expect(release).toContain('if git rev-parse --verify --quiet "refs/tags/$tag"');
    expect(release).toMatch(/- name: Build versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toMatch(/- name: Publish versioned image\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('${{ steps.image.outputs.name }}:${{ steps.release.outputs.tag }}');
    expect(release).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(release).toContain("github.event.workflow_run.event == 'push'");
    expect(release).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(release).toContain('load: true');
    expect(release).toContain('push: false');
    expect(release).not.toContain('push: true');
    const build = release.indexOf('- name: Build versioned image');
    const contents = release.indexOf('- name: Check image contents and Pterodactyl user');
    const startup = release.indexOf('- name: Check image startup and asset route');
    const publish = release.indexOf('- name: Publish versioned image');
    expect(build).toBeLessThan(contents);
    expect(contents).toBeLessThan(startup);
    expect(startup).toBeLessThan(publish);
    expect(release.indexOf('- name: Publish versioned image')).toBeLessThan(
      release.indexOf('- name: Create GitHub Release'),
    );
  });

  it('keeps all CI checks required when jobs run in parallel and cancels only outdated PRs', () => {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('group: ci-${{ github.event.pull_request.number || github.run_id }}');
    expect(ci).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
    const checks = ci.slice(ci.indexOf('  checks:'), ci.indexOf('  integration:'));
    const integration = ci.slice(ci.indexOf('  integration:'), ci.indexOf('  verify:'));
    for (const command of ['typecheck', 'lint', 'format:check']) expect(checks).toContain(`npm run ${command}`);
    expect(checks).toContain('npm test');
    expect(integration).not.toContain('needs:');
    for (const command of ['build', 'test:production', 'test:browser'])
      expect(integration).toContain(`npm run ${command}`);
    expect(integration).toContain('npx playwright install --with-deps --only-shell chromium');
    expect(integration).toContain('path: .next/cache');
    expect(ci).toMatch(/verify:\s+if: always\(\)\s+needs: \[checks, integration\]/);
    expect(ci).toContain('run: test "$CHECKS_RESULT" = success && test "$INTEGRATION_RESULT" = success');
  });
});
