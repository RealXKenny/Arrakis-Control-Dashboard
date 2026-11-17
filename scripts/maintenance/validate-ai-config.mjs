#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const errors = [];
const required = ['AGENTS.md'];
for (const f of required) if (!existsSync(join(root, f))) errors.push(`Missing required file: ${f}`);
const read = (f) => readFileSync(join(root, f), 'utf8');
const agents = existsSync(join(root, 'AGENTS.md')) ? read('AGENTS.md') : '';
if (!agents.includes('BEGIN:nextjs-agent-rules') || !agents.includes('END:nextjs-agent-rules'))
  errors.push('AGENTS.md is missing the Next.js managed block markers');
if (!agents.includes('Redis')) errors.push('AGENTS.md is missing Redis architecture guidance');
const retired = ['src/modules', 'src/infrastructure'];
for (const path of retired) if (existsSync(join(root, path))) errors.push(`Retired directory exists: ${path}`);
if (errors.length) {
  console.error('AI config validation failed:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'AI config validation passed. This checks repository structure only; it does not verify agent-specific loading or sandbox enforcement.',
  );
