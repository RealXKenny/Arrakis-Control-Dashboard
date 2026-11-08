#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const errors = [];
const required = [
  'AGENTS.md',
  'CLAUDE.md',
  'CODEX.md',
  'GEMINI.md',
  'KIMI.md',
  '.claude/settings.json',
  '.codex/config.toml',
  '.github/copilot-instructions.md',
  'docs/ai/README.md',
  'docs/ai/installation.md',
  '.cursor/rules/arrakis.mdc',
  '.continue/rules/arrakis.md',
  '.windsurf/rules/arrakis.md',
  '.clinerules/01-arrakis.md',
  '.roo/rules/01-arrakis.md',
];
for (const f of required) if (!existsSync(join(root, f))) errors.push(`Missing required file: ${f}`);
const read = (f) => readFileSync(join(root, f), 'utf8');
const agents = existsSync(join(root, 'AGENTS.md')) ? read('AGENTS.md') : '';
if (!agents.includes('BEGIN:nextjs-agent-rules') || !agents.includes('END:nextjs-agent-rules'))
  errors.push('AGENTS.md is missing the Next.js managed block markers');
if (!agents.includes('Redis')) errors.push('AGENTS.md is missing Redis architecture guidance');
// Validate the checked-in adapters without claiming to emulate each assistant's loader.
for (const file of required.filter((file) => /\.(md|mdc)$/.test(file) && file !== 'AGENTS.md')) {
  if (existsSync(join(root, file)) && !read(file).includes('AGENTS.md'))
    errors.push(`Adapter or guide must reference AGENTS.md: ${file}`);
}
for (const [directory, field] of [
  ['.github/instructions', 'applyTo'],
  ['.cursor/rules', 'alwaysApply'],
  ['.continue/rules', 'alwaysApply'],
]) {
  if (!existsSync(join(root, directory))) {
    errors.push(`Missing rules directory: ${directory}`);
    continue;
  }
  for (const name of readdirSync(join(root, directory)).filter((name) => /\.(md|mdc)$/.test(name))) {
    const text = read(`${directory}/${name}`);
    const header = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    if (!header || !new RegExp(`^${field}:\\s*\\S+`, 'm').test(header[1]))
      errors.push(`Missing ${field} frontmatter: ${directory}/${name}`);
  }
}
if (existsSync(join(root, '.claude/settings.json'))) {
  try {
    const s = JSON.parse(read('.claude/settings.json'));
    if (!s.model) errors.push('Claude settings missing model');
    if (s.permissions?.defaultMode === 'bypassPermissions') errors.push('Claude settings bypass permissions');
  } catch (e) {
    errors.push(`Invalid Claude JSON: ${e.message}`);
  }
}
const docs = join(root, 'docs/ai');
if (existsSync(docs))
  for (const name of readdirSync(docs))
    if (name.endsWith('.md') && read(`docs/ai/${name}`).trim().length === 0) errors.push(`Empty guide: ${name}`);
const retired = ['src/modules', 'src/infrastructure'];
for (const path of retired) if (existsSync(join(root, path))) errors.push(`Retired directory exists: ${path}`);
if (errors.length) {
  console.error('AI config validation failed:\n' + errors.map((e) => ' - ' + e).join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'AI config validation passed. This checks structure and JSON only; it does not verify agent-specific loading or sandbox enforcement.',
  );
