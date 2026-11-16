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
if (existsSync(join(root, 'CLAUDE.md')) && !read('CLAUDE.md').includes('AGENTS.md'))
  errors.push('CLAUDE.md must reference AGENTS.md');
if (existsSync(join(root, '.claude/settings.json'))) {
  try {
    const s = JSON.parse(read('.claude/settings.json'));
    if (!s.model) errors.push('Claude settings missing model');
    if (s.permissions?.defaultMode === 'bypassPermissions') errors.push('Claude settings bypass permissions');
  } catch (e) {
    errors.push(`Invalid Claude JSON: ${e.message}`);
  }
}
// CLAUDE.md and .claude/settings.json are optional per-developer files; they are validated only when present.
const retired = ['src/modules', 'src/infrastructure'];
for (const path of retired) if (existsSync(join(root, path))) errors.push(`Retired directory exists: ${path}`);
if (errors.length) {
  console.error('AI config validation failed:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'AI config validation passed. This checks structure and JSON only; it does not verify agent-specific loading or sandbox enforcement.',
  );
