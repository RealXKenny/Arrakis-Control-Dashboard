#!/usr/bin/env node
/**
 * Lightweight documentation check (no dependencies):
 *  - every relative Markdown link and `#anchor` resolves (GitHub heading slugs and `<a id>` anchors),
 *  - no link points at a retired audit report,
 *  - no documentation page is empty or a stub.
 *
 *   npm run docs:check
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const RETIRED = [
  'SECURITY_AUDIT.md',
  'SECURITY_REAUDIT.md',
  'SECURITY_REMEDIATION.md',
  'SECURITY_FINAL_SIGNOFF.md',
  'SECURITY_PRODUCTION_READINESS.md',
  'PRODUCTION_DEPLOYMENT_CHECKLIST.md',
];
const MIN_PAGE_CHARACTERS = 300;
const SKIP_DIRECTORIES = new Set(['node_modules', '.git', '.next', 'test-results', 'coverage', 'playwright-report']);

function markdownFiles(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    if (SKIP_DIRECTORIES.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) markdownFiles(path, found);
    else if (entry.endsWith('.md')) found.push(path);
  }
  return found;
}

/** Lines outside fenced code blocks, with their 1-based numbers. */
function proseLines(text) {
  const lines = [];
  let fence = null;
  text.split(/\r?\n/).forEach((line, index) => {
    const marker = /^\s*(```|~~~)/.exec(line);
    if (marker) fence = fence === marker[1] ? null : (fence ?? marker[1]);
    else if (!fence) lines.push([index + 1, line]);
  });
  return lines;
}

export function slug(heading) {
  return heading
    .replace(/<[^>]+>/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, (character) => (character === '_' ? '_' : ''))
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, '')
    .replace(/ /g, '-');
}

const anchorCache = new Map();
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file);
  const anchors = new Set();
  const seen = new Map();
  for (const [, line] of proseLines(readFileSync(file, 'utf8'))) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const base = slug(heading[1]);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      anchors.add(count ? `${base}-${count}` : base);
    }
    for (const explicit of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(explicit[1]);
  }
  anchorCache.set(file, anchors);
  return anchors;
}

export function checkDocs(rootDirectory = root) {
  const problems = [];
  const files = markdownFiles(rootDirectory);
  for (const file of files) {
    const shown = relative(rootDirectory, file).replaceAll('\\', '/');
    const text = readFileSync(file, 'utf8');
    if (
      shown.startsWith('docs/') &&
      !shown.startsWith('docs/ai/') &&
      !shown.startsWith('docs/legal/') &&
      text.trim().length < MIN_PAGE_CHARACTERS
    )
      problems.push(`${shown}: page is empty or a stub`);
    for (const [number, line] of proseLines(text)) {
      for (const match of line.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
        const target = match[1];
        if (/^(https?:|mailto:|tel:|data:)/i.test(target)) continue;
        const [pathPart, hash] = target.split('#');
        if (RETIRED.some((name) => pathPart.endsWith(name))) {
          problems.push(`${shown}:${number}: link to retired report ${pathPart}`);
          continue;
        }
        const destination = pathPart ? resolve(dirname(file), decodeURIComponent(pathPart)) : file;
        if (!existsSync(destination)) {
          problems.push(`${shown}:${number}: missing target ${target}`);
          continue;
        }
        if (
          hash &&
          statSync(destination).isFile() &&
          destination.endsWith('.md') &&
          !anchorsOf(destination).has(decodeURIComponent(hash).toLowerCase())
        )
          problems.push(
            `${shown}:${number}: missing anchor #${hash} in ${relative(rootDirectory, destination).replaceAll('\\', '/')}`,
          );
      }
      for (const name of RETIRED)
        if (line.includes(name) && !/^\s*(```|~~~)/.test(line))
          problems.push(`${shown}:${number}: mentions retired report ${name}`);
    }
  }
  return { files: files.length, problems };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { files, problems } = checkDocs();
  if (problems.length) {
    console.error(
      `Documentation check failed (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n${problems.map((p) => ` - ${p}`).join('\n')}`,
    );
    process.exitCode = 1;
  } else console.log(`Documentation check passed: ${files} Markdown files, all relative links and anchors resolve.`);
}
