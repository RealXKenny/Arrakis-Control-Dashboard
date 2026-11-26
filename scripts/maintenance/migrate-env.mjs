#!/usr/bin/env node
/**
 * Migrates an existing `.env` to the current variable names.
 *
 *  - renames variables that were replaced (values are carried over, never printed),
 *  - removes variables that no longer exist,
 *  - appends variables that are new in `.env.example` as commented placeholders,
 *  - leaves every other line, comment and unknown variable untouched.
 *
 * It is idempotent, writes a timestamped backup before changing anything, and only ever reports variable NAMES.
 * `npm run env:migrate` runs it by hand; the server launcher runs it before loading `.env`.
 */
import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Old name -> new name. When several old names map to one new name, earlier entries win. */
export const RENAMES = [
  ['CONSOLE_URL', 'DUNE_API_URL'],
  ['ADMIN_CONSOLE_API_KEY', 'DUNE_API_KEY'],
  ['CONSOLE_API_KEY', 'DUNE_API_KEY'],
  ['ADAPTER_TOKEN', 'DUNE_ADAPTER_TOKEN'],
];
/** Variables that no longer exist. Their behavior is now automatic or moved elsewhere. */
export const REMOVED = [
  'SEASON_GAME_DELIVERY_ENABLED',
  'SEASON_AUTOMATION_ENABLED',
  // The administrator system no longer exists.
  'ADMIN_DISCORD_IDS',
  'ADMIN_REAUTH_HOURS',
  'ADMIN_HIGH_RISK_REAUTH_MINUTES',
];

const assignment = /^(\s*)(export\s+)?([A-Za-z_][A-Za-z0-9_]*)(\s*=)(.*)$/;
const commentedAssignment = /^\s*#\s*([A-Z][A-Z0-9_]*)\s*=/;

export function parseKeys(text) {
  const keys = new Map();
  text.split(/\r?\n/).forEach((line, index) => {
    const match = assignment.exec(line);
    if (match) keys.set(match[3], index);
  });
  return keys;
}
/** Names the template defines, active or commented out. */
export function templateKeys(template) {
  const names = new Set();
  for (const line of template.split(/\r?\n/)) {
    const active = assignment.exec(line);
    if (active) names.add(active[3]);
    const commented = commentedAssignment.exec(line);
    if (commented) names.add(commented[1]);
  }
  return names;
}
/**
 * Pure migration. Returns the new text and a list of human-readable changes that never contain values.
 * `template` is the text of `.env.example`.
 */
export function migrateEnv(text, template) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let lines = text.split(/\r?\n/);
  const changes = [];
  const warnings = [];
  const present = () => parseKeys(lines.join('\n'));
  // 1. Renames: carry the value over in the original position and keep any trailing text such as quoting.
  const chosen = new Map();
  for (const [from, to] of RENAMES) {
    const keys = present();
    if (!keys.has(from)) continue;
    const index = keys.get(from);
    const hasNew = keys.has(to) || chosen.has(to);
    const emptyNew = hasNew && keys.has(to) && /^\s*$/.test(lines[keys.get(to)].replace(assignment, '$5').trim());
    if (hasNew && !emptyNew) {
      lines.splice(index, 1);
      changes.push(`removed ${from} (${to} is already set)`);
      continue;
    }
    if (emptyNew) lines.splice(keys.get(to), 1);
    const fresh = present();
    const at = fresh.get(from);
    lines[at] = lines[at].replace(
      assignment,
      (_all, space, exp, _name, eq, value) => `${space}${exp ?? ''}${to}${eq}${value}`,
    );
    chosen.set(to, from);
    changes.push(`renamed ${from} to ${to}`);
  }
  if (
    chosen.get('DUNE_API_KEY') === 'ADMIN_CONSOLE_API_KEY' ||
    (text.includes('CONSOLE_API_KEY') && text.includes('ADMIN_CONSOLE_API_KEY'))
  )
    warnings.push(
      'DUNE_API_KEY now serves reads, administration and season delivery. Check that the key you kept has every scope you need.',
    );
  if (chosen.has('DUNE_ADAPTER_TOKEN'))
    warnings.push('DUNE_ADAPTER_TOKEN must equal the Console Discord adapter token and differ from DUNE_API_KEY.');
  // 2. Removed variables.
  for (const name of REMOVED) {
    const keys = present();
    if (!keys.has(name)) continue;
    lines.splice(keys.get(name), 1);
    changes.push(`removed ${name} (no longer used)`);
  }
  // 3. New variables from the template, appended as commented placeholders so no placeholder secret becomes live.
  const keys = present();
  const knownCommented = new Set();
  for (const line of lines) {
    const match = commentedAssignment.exec(line);
    if (match) knownCommented.add(match[1]);
  }
  const templateLines = template.split(/\r?\n/);
  const additions = [];
  const seen = new Set();
  for (const line of templateLines) {
    const active = assignment.exec(line);
    if (!active) continue;
    const name = active[3];
    if (seen.has(name) || keys.has(name) || knownCommented.has(name)) continue;
    seen.add(name);
    additions.push(`# ${name}${active[4].trim()}${active[5]}`);
    changes.push(`added ${name} (commented out; fill it in if you need it)`);
  }
  if (additions.length) {
    while (lines.length && lines[lines.length - 1] === '') lines.pop();
    lines.push('', '# Added by npm run env:migrate. Uncomment and set the values you need.', ...additions, '');
  }
  const next = lines.join(eol);
  return { text: next.endsWith(eol) || !next ? next : next + eol, changes, warnings, changed: changes.length > 0 };
}
/** Reads `.env` and `.env.example` from `directory`, backs up, and writes atomically. Safe to call on every start. */
export function migrateEnvFile(directory = process.cwd(), options = {}) {
  const file = join(directory, '.env');
  const templateFile = join(directory, '.env.example');
  if (!existsSync(file) || !existsSync(templateFile))
    return { changed: false, changes: [], warnings: [], skipped: true };
  const result = migrateEnv(readFileSync(file, 'utf8'), readFileSync(templateFile, 'utf8'));
  if (!result.changed || options.dryRun) return { ...result, skipped: false, applied: false };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${file}.bak-${stamp}`;
  copyFileSync(file, backup);
  const mode = statSync(file).mode & 0o777;
  const temporary = `${file}.tmp-${process.pid}`;
  writeFileSync(temporary, result.text, { mode });
  try {
    chmodSync(temporary, mode);
  } catch {
    /* Windows has no POSIX modes */
  }
  renameSync(temporary, file);
  return { ...result, skipped: false, applied: true, backup };
}
function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const quiet = argv.includes('--quiet');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const result = migrateEnvFile(root, { dryRun });
  if (result.skipped) {
    if (!quiet) console.log('No .env or .env.example found; nothing to migrate.');
    return;
  }
  if (!result.changed) {
    if (!quiet) console.log('.env is already up to date.');
    return;
  }
  console.log(`${dryRun ? 'Would change' : 'Migrated'} .env (names only; values are never printed):`);
  for (const change of result.changes) console.log(` - ${change}`);
  for (const warning of result.warnings) console.log(` ! ${warning}`);
  if (result.backup) console.log(`Backup: ${result.backup}`);
  if (dryRun) console.log('Run npm run env:migrate to apply.');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) main(process.argv.slice(2));
