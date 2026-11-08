#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = fileURLToPath(new URL('../../', import.meta.url));
const baseSha = process.env.CI_BASE_SHA;
const diffArguments = baseSha
  ? ['diff', '--name-only', '--diff-filter=ACMR', '-z', `${baseSha}...HEAD`]
  : ['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD'];
const changedPaths = execFileSync('git', diffArguments, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const markdownFiles = changedPaths
  .filter((path) => path.toLowerCase().endsWith('.md'))
  .filter((path) => path.split('/').join(sep).startsWith(`docs${sep}`))
  .map((path) => resolve(root, path));

if (markdownFiles.length === 0) {
  console.log('Markdown formatting check passed: no changed docs to check.');
  process.exit(0);
}

const unformatted = [];
for (const path of markdownFiles) {
  const options = (await prettier.resolveConfig(path)) ?? {};
  const formatted = await prettier.check(readFileSync(path, 'utf8'), { ...options, filepath: path });
  if (!formatted) unformatted.push(relative(root, path).split(sep).join('/'));
}

if (unformatted.length) {
  console.error(`Markdown formatting check failed:\n${unformatted.map((path) => ` - ${path}`).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Markdown formatting check passed: ${markdownFiles.length} changed documentation file(s).`);
}
