import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

type Step = {
  uses?: string;
  run?: string;
  if?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  permissions?: Record<string, string>;
  needs?: string | string[];
  steps?: Step[];
  ['timeout-minutes']?: number;
};
type Workflow = {
  on: Record<string, unknown> | string[];
  permissions?: Record<string, string>;
  jobs: Record<string, Job>;
};

const directory = path.resolve('.github/workflows');
const workflows = fs
  .readdirSync(directory)
  .filter((file) => file.endsWith('.yml'))
  .map((file) => ({ file, text: fs.readFileSync(path.join(directory, file), 'utf8') }))
  .map(({ file, text }) => ({ file, text, workflow: yaml.load(text) as Workflow }));

describe('GitHub Actions workflows', () => {
  it('parse as valid YAML with at least one job each', () => {
    expect(workflows.length).toBeGreaterThanOrEqual(2);
    for (const { file, workflow } of workflows) expect(Object.keys(workflow.jobs).length, file).toBeGreaterThan(0);
  });

  it('pin every third-party action to a full commit SHA', () => {
    for (const { file, workflow } of workflows)
      for (const job of Object.values(workflow.jobs))
        for (const step of job.steps ?? [])
          if (step.uses) expect(step.uses, file).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}( |$)/);
  });

  it('default to read-only token permissions and grant write only to the release job', () => {
    for (const { file, workflow } of workflows) {
      expect(workflow.permissions, `${file} top-level permissions`).toEqual({ contents: 'read' });
      for (const [name, job] of Object.entries(workflow.jobs)) {
        const granted = Object.entries(job.permissions ?? {}).filter(([, level]) => level !== 'read');
        if (granted.length) {
          expect(file).toBe('release.yml');
          expect(name).toBe('publish');
          expect(granted).toEqual([['contents', 'write']]);
        }
      }
    }
  });

  it('never use privileged triggers that run untrusted pull-request code with secrets', () => {
    for (const { file, text } of workflows) {
      expect(text, file).not.toMatch(/pull_request_target/);
      expect(text, file).not.toMatch(/secrets\./);
    }
  });

  it('keep untrusted event data out of shell scripts (it is passed through env instead)', () => {
    const risky = /\$\{\{\s*github\.(event\.(pull_request|head_commit|issue|comment|review)|head_ref)[^}]*\}\}/;
    for (const { file, workflow } of workflows)
      for (const job of Object.values(workflow.jobs))
        for (const step of job.steps ?? []) expect(step.run ?? '', file).not.toMatch(risky);
  });

  it('only releases from a successful CI run of a push to main in this repository', () => {
    const release = workflows.find(({ file }) => file === 'release.yml')!;
    const condition = String((release.workflow.jobs.validate as unknown as { if: string }).if);
    for (const part of [
      "workflow_run.conclusion == 'success'",
      "workflow_run.event == 'push'",
      "workflow_run.head_branch == 'main'",
      'head_repository.full_name == github.repository',
    ])
      expect(condition).toContain(part);
  });

  it('builds and validates release assets before granting publish permission', () => {
    const release = workflows.find(({ file }) => file === 'release.yml')!;
    const validate = release.workflow.jobs.validate;
    const publish = release.workflow.jobs.publish;
    expect(release.text).toContain("lock_version=$(node -p \"require('./package-lock.json').packages[''].version\")");
    expect(validate.steps?.some((step) => step.uses?.startsWith('actions/upload-artifact@'))).toBe(true);
    expect(release.text).toContain('retention-days: 1');
    expect(publish.steps?.some((step) => step.uses?.startsWith('actions/download-artifact@'))).toBe(true);
    expect(publish.steps?.some((step) => step.run?.includes('gh release create'))).toBe(true);
    expect(publish.steps?.some((step) => step.run?.includes('build-pterodactyl-egg.mjs'))).toBe(false);
    expect(publish.permissions).toEqual({ contents: 'write' });
  });

  it('checks out trusted main before selecting a release commit verified to belong to main', () => {
    const release = workflows.find(({ file }) => file === 'release.yml')!;
    const steps = release.workflow.jobs.validate.steps!;
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'))!;
    expect(checkout.with?.ref).toBe('main');
    const guard = steps.find((step) => step.run?.includes('git merge-base --is-ancestor'))!.run!;
    expect(guard.indexOf('git checkout --detach "$HEAD_SHA"')).toBeGreaterThan(
      guard.indexOf('git merge-base --is-ancestor "$HEAD_SHA" refs/remotes/origin/main'),
    );
    expect(steps.findIndex((step) => step.run?.includes('git merge-base --is-ancestor'))).toBeLessThan(
      steps.findIndex((step) => step.run?.includes("require('./package.json')")),
    );
  });

  it('publishes a checksum alongside the archive that the installer verifies', () => {
    const release = workflows.find(({ file }) => file === 'release.yml')!.text;
    expect(release).toMatch(/sha256sum "\$name" > "\$name\.sha256"/);
    expect(release).toContain('git archive --format=tar.gz --prefix=arrakis-control-dashboard/');
    expect(release).toMatch(/gh release create "\$RELEASE_TAG" "\$EGG_FILE" "\$ARCHIVE_FILE" "\$ARCHIVE_FILE\.sha256"/);
  });

  it('runs the Redis integration suites on Redis 7.4 and bounds their runtime', () => {
    const ci = workflows.find(({ file }) => file === 'ci.yml')!;
    const cluster = workflows.find(({ file }) => file === 'redis-cluster.yml')!;
    expect(ci.text).toContain('redis:7.4-alpine');
    const standalone = ci.workflow.jobs['redis-integration'];
    const clusterJob = cluster.workflow.jobs.integration;
    expect(standalone['timeout-minutes']).toBeLessThanOrEqual(30);
    expect(standalone.steps?.some((step) => step.run === 'npm run test:integration')).toBe(true);
    expect(clusterJob['timeout-minutes']).toBeLessThanOrEqual(30);
    const clusterRun = clusterJob.steps?.find((step) => step.run?.includes('npm run test:integration'));
    expect(clusterRun?.run).toContain('set -euo pipefail');
    expect(clusterRun?.run).toContain('npm run test:integration 2>&1 | tee test-results/redis-cluster.log');
    expect(clusterRun?.env).toHaveProperty('TEST_REDIS_CLUSTER_NODES');
    expect(JSON.stringify(clusterJob)).toContain('TEST_REDIS_CLUSTER_NODES');
    expect(JSON.stringify(clusterJob)).toContain('--cluster-replicas 1');
    expect(JSON.stringify(ci.workflow.jobs.required)).not.toContain('redis-cluster');
    expect(cluster.workflow.on).toHaveProperty('schedule');
    expect(cluster.workflow.on).toHaveProperty('workflow_dispatch');
    expect(cluster.workflow.on).toHaveProperty('push.branches', ['v2']);
    const evidence = clusterJob.steps?.find((step) => step.uses?.startsWith('actions/upload-artifact@'));
    expect(evidence?.if).toBe('always()');
    expect(evidence?.with?.['retention-days']).toBe(7);
    expect(clusterJob.steps?.find((step) => step.run?.includes('docker rm -f'))?.if).toBe('always()');
  });

  it('keeps Dependabot watching both workflows and npm dependencies', () => {
    const config = yaml.load(fs.readFileSync(path.resolve('.github/dependabot.yml'), 'utf8')) as {
      updates: Array<{ 'package-ecosystem': string }>;
    };
    expect(config.updates.map((update) => update['package-ecosystem']).sort()).toEqual(['github-actions', 'npm']);
  });
});
