#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';

const root = fileURLToPath(new URL('../../', import.meta.url));
const workflowDirectory = join(root, '.github', 'workflows');
const errors = [];
const workflows = [];
const workflowNames = new Set();
const jobDisplayNames = new Map();

function readYaml(path) {
  try {
    return load(readFileSync(path, 'utf8'), { filename: relative(root, path) });
  } catch (error) {
    errors.push(`${relative(root, path)}: ${error.message}`);
    return null;
  }
}

for (const name of readdirSync(workflowDirectory).filter((entry) => /\.(yml|yaml)$/.test(entry))) {
  const path = join(workflowDirectory, name);
  const document = readYaml(path);
  if (!document || typeof document !== 'object') {
    errors.push(`${relative(root, path)}: expected a YAML mapping`);
    continue;
  }
  if (typeof document.name !== 'string' || !document.name.trim())
    errors.push(`${relative(root, path)}: missing workflow name`);
  else if (workflowNames.has(document.name))
    errors.push(`${relative(root, path)}: duplicate workflow name ${document.name}`);
  else workflowNames.add(document.name);
  if (!document.on || typeof document.on !== 'object')
    errors.push(`${relative(root, path)}: missing workflow triggers`);
  if (!document.permissions || typeof document.permissions !== 'object')
    errors.push(`${relative(root, path)}: missing explicit workflow permissions`);
  if (!document.jobs || typeof document.jobs !== 'object') {
    errors.push(`${relative(root, path)}: missing jobs`);
    continue;
  }

  const jobNames = new Set();
  for (const [id, job] of Object.entries(document.jobs)) {
    if (!job || typeof job !== 'object') {
      errors.push(`${relative(root, path)}: job ${id} is not a mapping`);
      continue;
    }
    if (typeof job.name !== 'string' || !job.name.trim())
      errors.push(`${relative(root, path)}: job ${id} needs an explicit name`);
    else if (jobNames.has(job.name)) errors.push(`${relative(root, path)}: duplicate job name ${job.name}`);
    else {
      jobNames.add(job.name);
      if (jobDisplayNames.has(job.name))
        errors.push(`${relative(root, path)}: job name ${job.name} duplicates ${jobDisplayNames.get(job.name)}`);
      else jobDisplayNames.set(job.name, relative(root, path));
    }

    if (!Number.isInteger(job['timeout-minutes']) || job['timeout-minutes'] < 1)
      errors.push(`${relative(root, path)}: job ${id} needs a positive timeout-minutes`);

    if (typeof job.uses === 'string' && !job.uses.startsWith('./') && !/^[^@\s]+@[a-f0-9]{40}(?:#.*)?$/i.test(job.uses))
      errors.push(`${relative(root, path)}: reusable workflow ${id} must pin to a full commit SHA`);

    const dependencies = job.needs === undefined ? [] : Array.isArray(job.needs) ? job.needs : [job.needs];
    for (const dependency of dependencies)
      if (typeof dependency !== 'string' || !Object.hasOwn(document.jobs, dependency))
        errors.push(`${relative(root, path)}: job ${id} has unknown dependency ${dependency}`);

    for (const [index, step] of (job.steps ?? []).entries()) {
      if (typeof step.uses !== 'string' || step.uses.startsWith('./')) continue;
      if (step.uses.startsWith('docker://')) {
        if (!/@sha256:[a-f0-9]{64}$/i.test(step.uses))
          errors.push(`${relative(root, path)}: job ${id} step ${index + 1} must pin its container image by digest`);
        continue;
      }
      if (!/^[^@\s]+@[a-f0-9]{40}(?:#.*)?$/i.test(step.uses))
        errors.push(`${relative(root, path)}: job ${id} step ${index + 1} must pin its action to a full commit SHA`);
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      errors.push(`${relative(root, path)}: cyclic job dependency includes ${id}`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const needs = document.jobs[id]?.needs;
    for (const dependency of needs === undefined ? [] : Array.isArray(needs) ? needs : [needs])
      if (typeof dependency === 'string' && Object.hasOwn(document.jobs, dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const jobId of Object.keys(document.jobs)) visit(jobId);

  workflows.push({ file: name, document });
}

const dependabotPath = join(root, '.github', 'dependabot.yml');
const dependabot = readYaml(dependabotPath);
if (dependabot?.version !== 2 || !Array.isArray(dependabot.updates) || dependabot.updates.length === 0)
  errors.push('.github/dependabot.yml: expected version 2 and at least one update configuration');

const ci = workflows.find(({ document }) => document.name === 'CI');
if (!ci) errors.push('Missing CI workflow');
else {
  const triggers = ci.document.on;
  for (const event of ['pull_request', 'push', 'merge_group'])
    if (!Object.hasOwn(triggers, event)) errors.push(`CI workflow must trigger on ${event}`);

  const pullRequest = triggers.pull_request;
  if (pullRequest && typeof pullRequest === 'object' && ('paths' in pullRequest || 'paths-ignore' in pullRequest))
    errors.push('CI pull_request trigger must not use path filters');

  const jobs = ci.document.jobs;
  const gate = Object.entries(jobs).find(([, job]) => job.name === 'CI / Required Checks');
  if (!gate) errors.push('CI workflow is missing the stable CI / Required Checks job');
  else {
    const [gateId, gateJob] = gate;
    const expected = Object.keys(jobs)
      .filter((id) => id !== gateId)
      .sort();
    const actual = (Array.isArray(gateJob.needs) ? gateJob.needs : [gateJob.needs]).filter(Boolean).sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      errors.push('CI / Required Checks must depend on every other CI job');
    if (!String(gateJob.if ?? '').includes('always()'))
      errors.push('CI / Required Checks must run with always() so it can report failures and skips');
    if (gateJob['continue-on-error']) errors.push('CI / Required Checks must not use continue-on-error');
    for (const [id, job] of Object.entries(jobs))
      if (id !== gateId) {
        if (job['continue-on-error']) errors.push(`Mandatory CI job ${id} must not use continue-on-error`);
        for (const [index, step] of (job.steps ?? []).entries())
          if (step['continue-on-error'])
            errors.push(`Mandatory CI job ${id} step ${index + 1} must not use continue-on-error`);
      }
  }
}

if (errors.length) {
  console.error(
    `Workflow validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):\n${errors.map((error) => ` - ${error}`).join('\n')}`,
  );
  process.exitCode = 1;
} else {
  console.log(`Workflow validation passed: ${workflows.length} workflows and Dependabot configuration validated.`);
}
