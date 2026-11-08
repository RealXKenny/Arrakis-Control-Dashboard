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
    const heading = `## Patch Notes v${packageMetadata.version}`;
    const start = notes.split(/\r?\n/).findIndex((line) => line.trimEnd() === heading);

    expect(packageMetadata.version).toMatch(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    expect(packageLockMetadata.version).toBe(packageMetadata.version);
    expect(packageLockMetadata.packages?.['']?.version).toBe(packageMetadata.version);
    expect(start).toBeGreaterThan(-1);

    const remainingLines = notes.split(/\r?\n/).slice(start + 1);
    const nextRelease = remainingLines.findIndex((line) => /^## /.test(line));
    const section = (nextRelease === -1 ? remainingLines : remainingLines.slice(0, nextRelease)).join('\n').trim();

    expect(section).not.toBe('');
  });

  it('attaches a generated Pterodactyl egg only for a new version release', () => {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    const release = fs.readFileSync(path.resolve('.github/workflows/release.yml'), 'utf8');

    expect(ci).not.toContain('docker push');
    expect(release).not.toContain('docker');
    expect(release).not.toContain('packages: write');
    expect(release).toContain('if git rev-parse --verify --quiet "refs/tags/$tag"');
    expect(release).toMatch(/- name: Build Pterodactyl egg\r?\n\s+if: steps\.release\.outputs\.create == 'true'/);
    expect(release).toContain('node scripts/deployment/build-pterodactyl-egg.mjs "$EGG_FILE"');
    expect(release).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(release).toContain("github.event.workflow_run.event == 'push'");
    expect(release).toContain("github.event.workflow_run.head_branch == 'main'");
    const build = release.indexOf('- name: Build Pterodactyl egg');
    const publish = release.indexOf('- name: Create GitHub Release');
    expect(build).toBeLessThan(publish);
    expect(release).toContain('gh release create "$RELEASE_TAG" "$EGG_FILE"');
  });

  it('keeps every mandatory CI job in the stable aggregate and cancels only outdated PRs', () => {
    const ci = fs.readFileSync(path.resolve('.github/workflows/ci.yml'), 'utf8');
    expect(ci).toContain('group: ci-${{ github.event.pull_request.number || github.run_id }}');
    expect(ci).toContain("cancel-in-progress: ${{ github.event_name == 'pull_request' }}");
    const quality = ci.slice(ci.indexOf('  quality:'), ci.indexOf('  workflow-validation:'));
    const documentation = ci.slice(ci.indexOf('  documentation:'), ci.indexOf('  integration:'));
    const integration = ci.slice(ci.indexOf('  integration:'), ci.indexOf('  redis-integration:'));
    expect(ci).toContain('merge_group:');
    expect(ci).toContain('types: [checks_requested]');
    expect(ci).not.toContain('paths-ignore:');
    expect(ci).toContain('name: CI / Required Checks');
    expect(ci).toContain('needs: [quality, workflow-validation, documentation, integration, redis-integration]');
    expect(ci).toContain('if: always()');
    expect(ci).toContain('job.result !== "success"');
    // Independent runners preserve the existing CPU-heavy tests without a large build matrix.
    expect(quality).toContain('task: [typecheck, lint, format:check, ai:check, workflows:check, test]');
    expect(quality).toContain('npm run "$TASK"');
    expect(quality).toContain('fail-fast: false');
    expect(documentation).toContain('npm run docs:check');
    expect(documentation).toContain('npm run docs:format:check');
    expect(documentation).toContain('fetch-depth: 0');
    expect(integration).not.toContain('needs:');
    for (const command of ['build', 'test:production', 'test:browser'])
      expect(integration).toContain(`npm run ${command}`);
    expect(integration).toContain('npx playwright install --with-deps --only-shell chromium');
    expect(integration).toContain('path: .next/cache');
    // The marketplace scripts run against a real Redis service, never a mock.
    expect(ci).toContain('npm run test:integration');
    expect(ci).toMatch(/redis-integration:[\s\S]*services:\s+redis:/);
    expect(ci).toContain('persist-credentials: false');
  });
});
