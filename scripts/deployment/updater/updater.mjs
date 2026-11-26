/**
 * Arrakis Control release updater (shared by the dashboard and the bot; keep both copies identical).
 *
 * Safety model, in one paragraph: only files listed in a verified release manifest are ever written, replaced or
 * removed, plus the declared generated directories (`node_modules` and the build output). Everything else under the
 * install directory — `.env`, certificates, keys, uploads, logs, custom folders — is never read for writing, moved,
 * re-permissioned or deleted. A managed file that was changed locally, or an unmanaged file sitting where the new
 * release wants to put one, is a conflict: the update stops before touching anything. Every replaced or removed file
 * is backed up first and a journal makes an interrupted activation roll back on the next start.
 *
 * The new version is downloaded, checksum-verified, extracted (plain files and directories only, no links, no
 * absolute or parent paths), checked file by file against the release manifest, then installed and built in an
 * isolated staging directory with a minimal environment (no panel secrets reach dependency scripts). Only a build
 * that succeeded is activated.
 */
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export const STATE_DIR = '.arrakis';
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024 * 1024;
const MAX_FILES = 50_000;
const LOCK_STALE_MS = 3 * 3_600_000;
const SEMVER = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?$/;

export class UpdateError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'UpdateError';
    this.details = details;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------------------------------------------

const truthy = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value).trim());
};

/** Read updater settings from the environment, with conservative bounds. */
export function updaterSettings(env = process.env) {
  const hours = Number(env.AUTO_UPDATE_INTERVAL_HOURS ?? 6);
  const health = Number(env.AUTO_UPDATE_HEALTH_SECONDS ?? 120);
  const channel = String(env.AUTO_UPDATE_CHANNEL ?? 'stable')
    .trim()
    .toLowerCase();
  const pin = String(env.RELEASE_TAG ?? 'latest').trim();
  const window = String(env.AUTO_UPDATE_WINDOW_UTC ?? '').trim();
  if (window && !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(window))
    throw new UpdateError('AUTO_UPDATE_WINDOW_UTC must look like 03:00-05:00 or be empty.');
  if (pin && pin !== 'latest' && !SEMVER.test(pin))
    throw new UpdateError('RELEASE_TAG must be latest or a version such as v2.1.0.');
  const token = String(env.AUTO_UPDATE_GITHUB_TOKEN ?? '').trim();
  if (token && !/^[A-Za-z0-9_]{20,255}$/.test(token)) throw new UpdateError('AUTO_UPDATE_GITHUB_TOKEN is malformed.');
  return {
    enabled: truthy(env.AUTO_UPDATE_ENABLED, true),
    onStartup: truthy(env.AUTO_UPDATE_ON_STARTUP, true),
    channel: channel === 'prerelease' ? 'prerelease' : 'stable',
    intervalMs: Math.min(Math.max(Number.isFinite(hours) ? hours : 6, 1), 168) * 3_600_000,
    healthMs: Math.min(Math.max(Number.isFinite(health) ? health : 120, 30), 900) * 1000,
    pin: !pin || pin === 'latest' ? null : pin.startsWith('v') ? pin : `v${pin}`,
    window: window || null,
    token: token || null,
  };
}

/** True when `now` falls inside an `HH:MM-HH:MM` UTC window (which may wrap past midnight). */
export function insideWindow(window, now = new Date()) {
  if (!window) return true;
  const [start, end] = window.split('-').map((part) => {
    const [h, m] = part.split(':').map(Number);
    return h * 60 + m;
  });
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return start <= end ? minute >= start && minute < end : minute >= start || minute < end;
}

// ---------------------------------------------------------------------------------------------------------------
// Versions and release selection
// ---------------------------------------------------------------------------------------------------------------

export function parseVersion(value) {
  const match = SEMVER.exec(String(value ?? ''));
  if (!match) return null;
  return {
    major: +match[1],
    minor: +match[2],
    patch: +match[3],
    pre: match[4] ?? null,
    text: String(value).replace(/^v/, ''),
  };
}

export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) throw new UpdateError('Cannot compare invalid versions.');
  for (const key of ['major', 'minor', 'patch']) if (left[key] !== right[key]) return left[key] - right[key];
  if (left.pre === right.pre) return 0;
  if (left.pre === null) return 1;
  if (right.pre === null) return -1;
  return left.pre < right.pre ? -1 : 1;
}

/** Choose the release to install from a GitHub releases list, or null when the current version is newest. */
export function selectRelease(releases, { current, channel, pin, bad = [] }) {
  const eligible = releases.filter((release) => {
    if (!release || release.draft || typeof release.tag_name !== 'string') return false;
    const version = parseVersion(release.tag_name);
    if (!version) return false;
    if (bad.includes(version.text)) return false;
    if (pin) return release.tag_name === pin;
    if (release.prerelease || version.pre) return channel === 'prerelease';
    return true;
  });
  eligible.sort((a, b) => compareVersions(b.tag_name, a.tag_name));
  const target = eligible[0];
  if (!target) return null;
  const difference = compareVersions(target.tag_name, current);
  // A pin never downgrades on its own: rolling back a database schema is not something an updater should guess at.
  if (difference <= 0) return null;
  return target;
}

// ---------------------------------------------------------------------------------------------------------------
// GitHub access
// ---------------------------------------------------------------------------------------------------------------

function githubHeaders(settings, accept = 'application/vnd.github+json', etag = null) {
  const headers = { Accept: accept, 'User-Agent': 'arrakis-control-updater', 'X-GitHub-Api-Version': '2022-11-28' };
  if (settings.token) headers.Authorization = `Bearer ${settings.token}`;
  if (etag) headers['If-None-Match'] = etag;
  return headers;
}

async function boundedJson(response, limit) {
  const text = await response.text();
  if (text.length > limit) throw new UpdateError('GitHub response was too large.');
  return JSON.parse(text);
}

/** List releases with a conditional request. Returns `{ notModified, releases, etag }`. */
export async function listReleases({ repository, settings, fetchImpl = globalThis.fetch, etag = null }) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}/releases?per_page=30`, {
    headers: githubHeaders(settings, undefined, etag),
    redirect: 'error',
    signal: globalThis.AbortSignal.timeout(20_000),
  });
  if (response.status === 304) return { notModified: true, releases: null, etag };
  if (!response.ok) throw new UpdateError(`GitHub answered ${response.status} while listing releases.`);
  const releases = await boundedJson(response, 8 * 1024 * 1024);
  if (!Array.isArray(releases)) throw new UpdateError('GitHub returned an unexpected releases list.');
  return { notModified: false, releases, etag: response.headers.get('etag') };
}

export async function releaseByTag({ repository, tag, settings, fetchImpl = globalThis.fetch }) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repository}/releases/tags/${encodeURIComponent(tag)}`,
    {
      headers: githubHeaders(settings),
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(20_000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new UpdateError(`GitHub answered ${response.status} for release ${tag}.`);
  return boundedJson(response, 4 * 1024 * 1024);
}

/** Find one named asset and insist it lives where this repository's releases live. */
export function releaseAsset(release, name, repository) {
  const matches = (release.assets ?? []).filter((asset) => asset?.name === name);
  if (matches.length !== 1) return null;
  const asset = matches[0];
  const expected = `https://github.com/${repository}/releases/download/${release.tag_name}/${name}`;
  if (asset.browser_download_url !== expected) throw new UpdateError(`Release asset ${name} has an unexpected URL.`);
  return asset;
}

async function download(asset, settings, destination, fetchImpl, limit) {
  // With a token (private repositories) the API asset endpoint is used; otherwise the public download URL.
  const url = settings.token && asset.url ? asset.url : asset.browser_download_url;
  const response = await fetchImpl(url, {
    headers: githubHeaders(settings, 'application/octet-stream'),
    redirect: 'follow',
    signal: globalThis.AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok || !response.body) throw new UpdateError(`Download of ${asset.name} failed (${response.status}).`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) throw new UpdateError(`${asset.name} is larger than allowed.`);
  const hash = createHash('sha256');
  let size = 0;
  const out = createWriteStream(destination, { flags: 'wx', mode: 0o600 });
  await pipeline(
    response.body,
    new Writable({
      write(chunk, _encoding, callback) {
        size += chunk.length;
        if (size > limit) return callback(new UpdateError(`${asset.name} is larger than allowed.`));
        hash.update(chunk);
        out.write(chunk, callback);
      },
      final(callback) {
        out.end(callback);
      },
    }),
  );
  return { sha256: hash.digest('hex'), size };
}

// ---------------------------------------------------------------------------------------------------------------
// Archive handling (tar.gz, written by `git archive`)
// ---------------------------------------------------------------------------------------------------------------

/** Validate one archive-relative path. Returns the path without the archive's top-level folder, or null for it. */
export function safeMemberPath(name) {
  if (typeof name !== 'string' || !name || name.includes('\0') || name.includes('\\'))
    throw new UpdateError('Invalid archive path.');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) throw new UpdateError(`Archive path ${name} is absolute.`);
  const parts = name.split('/').filter((part) => part !== '' && part !== '.');
  if (parts.some((part) => part === '..')) throw new UpdateError(`Archive path ${name} leaves the install directory.`);
  const stripped = parts.slice(1);
  if (!stripped.length) return null;
  return stripped.join('/');
}

/** A release must never carry files that belong to the operator. */
export function assertManagedPath(relative, generatedDirectories = []) {
  const first = relative.split('/')[0];
  if (
    first === STATE_DIR ||
    first === '.git' ||
    (/^\.env(\..*)?$/.test(path.posix.basename(relative)) && !relative.endsWith('.env.example'))
  )
    throw new UpdateError(`Release contains a reserved path: ${relative}`);
  if (generatedDirectories.includes(first)) throw new UpdateError(`Release contains a generated path: ${relative}`);
}

function octal(buffer, start, length) {
  const text = buffer
    .subarray(start, start + length)
    .toString('latin1')
    .replace(/\0.*$/s, '')
    .trim();
  return text ? parseInt(text, 8) : 0;
}
function text(buffer, start, length) {
  return buffer
    .subarray(start, start + length)
    .toString('utf8')
    .replace(/\0.*$/s, '');
}
function paxPath(data) {
  let offset = 0;
  let found = null;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) break;
    const length = Number(data.subarray(offset, space).toString('latin1'));
    if (!Number.isSafeInteger(length) || length <= 0) break;
    const record = data.subarray(space + 1, offset + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (record.slice(0, equals) === 'path') found = record.slice(equals + 1);
    offset += length;
  }
  return found;
}

/**
 * Stream a .tar.gz and call `onFile(relativePath, mode, buffer)` for every regular file. Directories are implied.
 * Links, devices and anything else are refused. Never writes anything itself.
 */
export async function readArchive(file, onFile) {
  let header = null;
  let need = 512;
  let nextPath = null;
  let count = 0;
  const processBlock = async (block) => {
    if (!header) {
      if (block.every((byte) => byte === 0)) return 512;
      const checksum = octal(block, 148, 8);
      let sum = 0;
      for (let index = 0; index < 512; index++) sum += index >= 148 && index < 156 ? 32 : block[index];
      if (sum !== checksum) throw new UpdateError('Release archive is corrupted (bad tar header).');
      const size = octal(block, 124, 12);
      const type = String.fromCharCode(block[156] || 48);
      const prefix = text(block, 345, 155);
      const name = nextPath ?? (prefix ? `${prefix}/${text(block, 0, 100)}` : text(block, 0, 100));
      header = { size, type, name, mode: octal(block, 100, 8) };
      if (size === 0) return finish(Buffer.alloc(0));
      return Math.ceil(size / 512) * 512;
    }
    return finish(block.subarray(0, header.size));
  };
  const finish = async (data) => {
    const { type, name, mode } = header;
    header = null;
    if (type === 'g') return 512; // git archive's global comment header
    if (type === 'x') {
      nextPath = paxPath(data);
      return 512;
    }
    if (type === 'L') {
      nextPath = data.toString('utf8').replace(/\0.*$/s, '');
      return 512;
    }
    nextPath = null;
    const relative = safeMemberPath(name);
    if (type === '5') return 512;
    if (type !== '0' && type !== '7') throw new UpdateError(`Release archive contains a link or special file: ${name}`);
    if (relative === null) throw new UpdateError('Release archive has a file at its top level.');
    if (++count > MAX_FILES) throw new UpdateError('Release archive has too many files.');
    await onFile(relative, mode & 0o777, data);
    return 512;
  };
  // Chunks are queued and joined only once a whole block is available, so large files stay linear to read.
  const queue = [];
  let queued = 0;
  const take = (size) => {
    const parts = [];
    let remaining = size;
    while (remaining > 0) {
      const head = queue[0];
      if (head.length <= remaining) {
        parts.push(queue.shift());
        remaining -= head.length;
      } else {
        parts.push(head.subarray(0, remaining));
        queue[0] = head.subarray(remaining);
        remaining = 0;
      }
    }
    queued -= size;
    return parts.length === 1 ? parts[0] : Buffer.concat(parts, size);
  };
  await pipeline(
    createReadStream(file),
    createGunzip(),
    new Writable({
      async write(chunk, _encoding, callback) {
        try {
          queue.push(chunk);
          queued += chunk.length;
          while (queued >= need) need = await processBlock(take(need));
          callback();
        } catch (error) {
          callback(error);
        }
      },
    }),
  );
  if (header) throw new UpdateError('Release archive is truncated.');
}

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');
export async function hashFile(file) {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

// ---------------------------------------------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------------------------------------------

export function statePaths(root) {
  const base = path.join(root, STATE_DIR);
  return {
    base,
    installed: path.join(base, 'installed.json'),
    state: path.join(base, 'state.json'),
    lock: path.join(base, 'update.lock'),
    journal: path.join(base, 'journal.json'),
    staging: path.join(base, 'staging'),
    downloads: path.join(base, 'downloads'),
    backups: path.join(base, 'backups'),
  };
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}
async function writeJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temp, file);
}

/** One update at a time per install. A lock left by a dead process or older than three hours is taken over. */
export async function acquireLock(root, now = Date.now()) {
  const { base, lock } = statePaths(root);
  await fs.mkdir(base, { recursive: true, mode: 0o700 });
  const body = JSON.stringify({ pid: process.pid, at: now });
  try {
    await fs.writeFile(lock, body, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const holder = await readJson(lock, {});
    let alive = false;
    try {
      if (Number.isInteger(holder.pid) && holder.pid !== process.pid) {
        process.kill(holder.pid, 0);
        alive = true;
      }
    } catch {
      alive = false;
    }
    if (alive && now - Number(holder.at ?? 0) < LOCK_STALE_MS)
      throw new UpdateError('Another update is already running.');
    await fs.rm(lock, { force: true });
    await fs.writeFile(lock, body, { flag: 'wx', mode: 0o600 });
  }
  return async () => {
    const holder = await readJson(lock, {});
    if (holder.pid === process.pid) await fs.rm(lock, { force: true });
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------------------------------------------

async function lstatOrNull(file) {
  try {
    return await fs.lstat(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Refuse to write through a symbolic link anywhere on the way to a managed path. */
async function assertNoLinkOnPath(root, relative) {
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await lstatOrNull(current);
    if (!stat) return;
    if (stat.isSymbolicLink()) throw new UpdateError(`Refusing to update through a symbolic link: ${relative}`);
  }
}

/**
 * Compare what is installed, what the operator has on disk, and what the new release ships.
 * `previous` and `next` map relative paths to SHA-256 hashes. Returns operations and conflicts; changes nothing.
 */
export async function planActivation(root, previous, next, { regenerable = [] } = {}) {
  const operations = [];
  const conflicts = [];
  for (const [relative, nextHash] of Object.entries(next)) {
    const target = path.join(root, relative);
    try {
      await assertNoLinkOnPath(root, relative);
    } catch (error) {
      conflicts.push({ path: relative, reason: error.message });
      continue;
    }
    const stat = await lstatOrNull(target);
    if (stat && !stat.isFile()) {
      conflicts.push({ path: relative, reason: 'a directory or special file is in the way' });
      continue;
    }
    const localHash = stat ? await hashFile(target) : null;
    if (localHash === nextHash) continue;
    if (relative in previous) {
      if (localHash !== null && localHash !== previous[relative] && !regenerable.includes(relative)) {
        conflicts.push({ path: relative, reason: 'modified locally since it was installed' });
        continue;
      }
      operations.push({ type: localHash === null ? 'create' : 'replace', path: relative });
    } else if (localHash !== null) {
      conflicts.push({ path: relative, reason: 'an unmanaged file already exists at a path the new release uses' });
    } else {
      operations.push({ type: 'create', path: relative });
    }
  }
  for (const [relative, previousHash] of Object.entries(previous)) {
    if (relative in next) continue;
    const target = path.join(root, relative);
    const stat = await lstatOrNull(target);
    if (!stat || !stat.isFile()) continue;
    // A retired file is removed only when it is still exactly what the old release installed.
    if ((await hashFile(target)) === previousHash) operations.push({ type: 'remove', path: relative });
    else operations.push({ type: 'keep', path: relative });
  }
  return { operations, conflicts };
}

// ---------------------------------------------------------------------------------------------------------------
// Activation, journal and rollback
// ---------------------------------------------------------------------------------------------------------------

async function copyPreservingMode(from, to, mode) {
  const temp = `${to}.arrakis-${randomUUID()}.tmp`;
  await fs.copyFile(from, temp);
  if (mode !== undefined) await fs.chmod(temp, mode);
  await fs.rename(temp, to);
}

/**
 * Create missing parent directories only; existing directories keep their permissions and owners. Returns the
 * directories it created (outermost first) so a rollback can remove exactly those, and only while they are empty.
 */
async function ensureParents(root, relative) {
  const missing = [];
  let current = path.dirname(relative);
  while (current && current !== '.' && !(await lstatOrNull(path.join(root, current)))) {
    missing.unshift(current);
    current = path.dirname(current);
  }
  for (const directory of missing) await fs.mkdir(path.join(root, directory));
  return missing;
}

/**
 * Apply a plan. `staged` is the built staging directory. The journal is written before every change so an
 * interrupted activation can be rolled back by `recover()`.
 */
export async function activate({ root, staged, plan, generatedDirectories, fromVersion, toVersion, modes, log }) {
  const paths = statePaths(root);
  const backup = path.join(
    paths.backups,
    `${new Date().toISOString().replace(/[:.]/g, '-')}-${fromVersion}-to-${toVersion}`,
  );
  await fs.mkdir(path.join(backup, 'files'), { recursive: true, mode: 0o700 });
  await fs.mkdir(path.join(backup, 'directories'), { recursive: true, mode: 0o700 });
  const journal = { state: 'activating', fromVersion, toVersion, backup, steps: [] };
  const save = () => writeJson(paths.journal, journal);
  await save();
  for (const operation of plan.operations) {
    if (operation.type === 'keep') {
      log(`Keeping locally changed retired file ${operation.path}`);
      continue;
    }
    const target = path.join(root, operation.path);
    if (operation.type === 'replace' || operation.type === 'remove') {
      const copy = path.join(backup, 'files', operation.path);
      await fs.mkdir(path.dirname(copy), { recursive: true });
      await fs.copyFile(target, copy);
      const { mode } = await fs.stat(target);
      journal.steps.push({ type: operation.type, path: operation.path, backup: copy, mode: mode & 0o7777 });
    } else {
      journal.steps.push({ type: 'create', path: operation.path });
    }
    await save();
    if (operation.type === 'remove') {
      await fs.rm(target, { force: true });
      continue;
    }
    const created = await ensureParents(root, operation.path);
    if (created.length) {
      // Recorded before the file step so the reverse replay removes the file first, then its new directories.
      const step = journal.steps.pop();
      for (const directory of created) journal.steps.push({ type: 'mkdir', path: directory });
      journal.steps.push(step);
      await save();
    }
    const existingMode = operation.type === 'replace' ? journal.steps.at(-1).mode : undefined;
    // Existing files keep their permissions; new files take the release's executable bit only.
    const mode = existingMode ?? ((modes[operation.path] ?? 0o644) & 0o111 ? 0o755 : 0o644);
    await copyPreservingMode(path.join(staged, operation.path), target, mode);
  }
  for (const directory of generatedDirectories) {
    const live = path.join(root, directory);
    const fresh = path.join(staged, directory);
    if (!(await lstatOrNull(fresh))) continue;
    const kept = path.join(backup, 'directories', directory);
    const existing = await lstatOrNull(live);
    if (existing?.isSymbolicLink())
      throw new UpdateError(`Generated directory ${directory} is a symbolic link; refusing.`);
    journal.steps.push({ type: 'directory', path: directory, backup: existing ? kept : null });
    await save();
    if (existing) await fs.rename(live, kept);
    await fs.rename(fresh, live);
  }
  journal.state = 'activated';
  await save();
  return journal;
}

/** Undo a journal in reverse order. Files the operator changed after activation are left alone. */
export async function rollback(root, journal, log) {
  for (const step of [...journal.steps].reverse()) {
    const target = path.join(root, step.path);
    try {
      if (step.type === 'mkdir') {
        // Removed only when empty: anything the operator put there since stays where it is.
        await fs.rmdir(target).catch(() => undefined);
      } else if (step.type === 'directory') {
        if (await lstatOrNull(target)) await fs.rm(target, { recursive: true, force: true });
        if (step.backup && (await lstatOrNull(step.backup))) await fs.rename(step.backup, target);
      } else if (step.type === 'create') {
        await fs.rm(target, { force: true });
      } else {
        await ensureParents(root, step.path);
        await copyPreservingMode(step.backup, target, step.mode);
      }
    } catch (error) {
      log(`Rollback could not restore ${step.path}: ${error.message}`);
      throw new UpdateError(`Rollback could not restore ${step.path}.`);
    }
  }
}

/** On start: an activation that never finished is rolled back before the application runs. */
export async function recover(root, log) {
  const paths = statePaths(root);
  const journal = await readJson(paths.journal);
  if (!journal) return null;
  if (journal.state === 'activating' || journal.state === 'activated') {
    log(`Previous update to ${journal.toVersion} did not finish; restoring ${journal.fromVersion}.`);
    await rollback(root, journal, log);
    const state = await readJson(paths.state, {});
    state.badVersions = [...new Set([...(state.badVersions ?? []), journal.toVersion])].slice(-20);
    await writeJson(paths.state, state);
    if (journal.previousInstalled) await writeJson(paths.installed, journal.previousInstalled);
  }
  await fs.rm(paths.journal, { force: true });
  return journal;
}

// ---------------------------------------------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------------------------------------------

/** Environment for dependency installation and builds: no panel secrets, no NODE_ENV=production. */
export function buildEnvironment(env = process.env) {
  const allowed = [
    'PATH',
    'HOME',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ',
    'NODE_OPTIONS',
    'NODE_EXTRA_CA_CERTS',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
  ];
  const result = { NEXT_TELEMETRY_DISABLED: '1', CI: '1' };
  for (const key of allowed) if (env[key] !== undefined) result[key] = env[key];
  for (const [key, value] of Object.entries(env)) if (key.startsWith('npm_config_')) result[key] = value;
  return result;
}

export function run(command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const collect = (chunk) => {
      output = (output + chunk.toString()).slice(-8_000);
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0
        ? resolve(output)
        : reject(new UpdateError(`${command} ${args.join(' ')} failed (exit ${code}).`, { output })),
    );
  });
}

/** Missing required configuration, checked against the process environment and a local `.env` (read only). */
export async function missingConfiguration(root, required, env = process.env) {
  const local = {};
  try {
    for (const line of (await fs.readFile(path.join(root, '.env'), 'utf8')).split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (match && match[2].trim() && !/^['"]?['"]?$/.test(match[2].trim())) local[match[1]] = true;
    }
  } catch {
    /* no .env is fine on Pterodactyl */
  }
  const present = (name) => (env[name] !== undefined && env[name] !== '') || local[name];
  return required.filter((entry) => !entry.split('|').some(present));
}

/** Satisfies a simple `>=X.Y.Z` engines range. */
export function nodeSatisfies(range, version = process.versions.node) {
  const match = /^>=\s*(\d+)(?:\.(\d+))?(?:\.(\d+))?\s*$/.exec(String(range ?? '').trim());
  if (!match) return true;
  const [major, minor, patch] = version.split('.').map(Number);
  const want = [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
  const have = [major, minor, patch];
  for (let index = 0; index < 3; index++) if (have[index] !== want[index]) return have[index] > want[index];
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------------------------------------------

/**
 * Hashes of every managed file for a release: from its manifest asset when published, otherwise derived from the
 * verified archive (releases published before manifests existed).
 */
async function releaseFiles({ release, config, settings, fetchImpl, workDir }) {
  const version = release.tag_name.replace(/^v/, '');
  const archiveName = `${config.assetPrefix}-${version}.tar.gz`;
  const archiveAsset = releaseAsset(release, archiveName, config.repository);
  const sumAsset = releaseAsset(release, `${archiveName}.sha256`, config.repository);
  if (!archiveAsset || !sumAsset) throw new UpdateError(`Release ${release.tag_name} has no checksummed archive.`);
  const manifestAsset = releaseAsset(release, `${config.assetPrefix}-${version}.manifest.json`, config.repository);
  await fs.mkdir(workDir, { recursive: true, mode: 0o700 });
  const sumFile = path.join(workDir, `${archiveName}.sha256`);
  await download(sumAsset, settings, sumFile, fetchImpl, 4096);
  const expected = (await fs.readFile(sumFile, 'utf8')).trim().split(/\s+/)[0];
  if (!/^[0-9a-f]{64}$/.test(expected)) throw new UpdateError('Release checksum file is malformed.');
  let manifest = null;
  if (manifestAsset) {
    const manifestFile = path.join(workDir, manifestAsset.name);
    await download(manifestAsset, settings, manifestFile, fetchImpl, MAX_MANIFEST_BYTES);
    manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    if (manifest?.schemaVersion !== 1 || manifest.version !== version || manifest.archive?.sha256 !== expected)
      throw new UpdateError('Release manifest does not match the release.');
  }
  const archiveFile = path.join(workDir, archiveName);
  const { sha256: actual } = await download(archiveAsset, settings, archiveFile, fetchImpl, MAX_ARCHIVE_BYTES);
  if (actual !== expected) throw new UpdateError('Release archive checksum does not match; refusing it.');
  // GitHub also reports its own digest for uploaded assets; when present it must agree.
  if (typeof archiveAsset.digest === 'string' && archiveAsset.digest !== `sha256:${actual}`)
    throw new UpdateError('Release archive digest disagrees with GitHub; refusing it.');
  return { archiveFile, manifest, version };
}

/** Extract into an empty staging directory and verify every file against the manifest. */
export async function extractVerified({ archiveFile, manifest, destination, generatedDirectories }) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true, mode: 0o700 });
  const files = {};
  const modes = {};
  await readArchive(archiveFile, async (relative, mode, data) => {
    assertManagedPath(relative, generatedDirectories);
    if (relative in files) throw new UpdateError(`Release archive lists ${relative} twice.`);
    const hash = sha256(data);
    if (manifest && manifest.files?.[relative]?.sha256 !== hash)
      throw new UpdateError(`Release file ${relative} does not match the manifest.`);
    const target = path.join(destination, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data, { mode: mode & 0o111 ? 0o755 : 0o644, flag: 'wx' });
    files[relative] = hash;
    modes[relative] = mode;
  });
  if (manifest) {
    const expected = Object.keys(manifest.files ?? {});
    if (expected.length !== Object.keys(files).length || expected.some((name) => !(name in files)))
      throw new UpdateError('Release archive and manifest list different files.');
  }
  return { files, modes };
}

async function hashArchive(archiveFile, generatedDirectories) {
  const files = {};
  await readArchive(archiveFile, async (relative, _mode, data) => {
    assertManagedPath(relative, generatedDirectories);
    files[relative] = sha256(data);
  });
  return files;
}

/**
 * Check for, stage and (unless `stageOnly`) activate an update. Returns a result object; never throws for
 * "nothing to do". The live installation is untouched unless activation starts, and is rolled back on failure.
 */
export async function checkAndUpdate({
  root,
  config,
  settings,
  fetchImpl = globalThis.fetch,
  log = (message) => globalThis.console.info(message),
  runImpl = run,
  env = process.env,
  stageOnly = false,
  beforeActivate = async () => undefined,
}) {
  if (!settings.enabled) return { status: 'disabled' };
  const paths = statePaths(root);
  const release = await acquireLock(root);
  try {
    const state = await readJson(paths.state, {});
    const pkg = await readJson(path.join(root, 'package.json'));
    const current = pkg?.version;
    if (!parseVersion(current)) throw new UpdateError('The installed package.json has no valid version.');

    let releases;
    const listed = await listReleases({ repository: config.repository, settings, fetchImpl, etag: state.etag ?? null });
    state.lastCheckAt = new Date().toISOString();
    if (listed.notModified && Array.isArray(state.releasesCache)) releases = state.releasesCache;
    else {
      releases = listed.releases ?? [];
      state.etag = listed.etag;
      // Keep only what selection needs, so the cached list stays small.
      state.releasesCache = releases.slice(0, 30).map((entry) => ({
        tag_name: entry.tag_name,
        draft: entry.draft,
        prerelease: entry.prerelease,
        assets: (entry.assets ?? []).map((asset) => ({
          name: asset.name,
          url: asset.url,
          browser_download_url: asset.browser_download_url,
          digest: asset.digest,
        })),
      }));
    }
    await writeJson(paths.state, state);

    const target = selectRelease(releases, {
      current,
      channel: settings.channel,
      pin: settings.pin,
      bad: state.badVersions ?? [],
    });
    if (!target) {
      if (settings.pin && compareVersions(settings.pin, current) < 0)
        log(`RELEASE_TAG ${settings.pin} is older than the installed ${current}; downgrades are never automatic.`);
      return { status: 'current', version: current };
    }
    const version = target.tag_name.replace(/^v/, '');
    log(`Update available: ${current} -> ${version}`);

    const workDir = path.join(paths.downloads, version);
    await fs.rm(workDir, { recursive: true, force: true });
    const fetched = await releaseFiles({ release: target, config, settings, fetchImpl, workDir });
    const staged = path.join(paths.staging, version);
    const { files, modes } = await extractVerified({
      archiveFile: fetched.archiveFile,
      manifest: fetched.manifest,
      destination: staged,
      generatedDirectories: config.generatedDirectories,
    });
    log(`Release ${version} verified (${Object.keys(files).length} files)`);

    const stagedPkg = await readJson(path.join(staged, 'package.json'));
    if (stagedPkg?.version !== version)
      throw new UpdateError('Staged package.json version does not match the release.');
    if (!nodeSatisfies(stagedPkg.engines?.node))
      throw new UpdateError(
        `Release ${version} needs Node.js ${stagedPkg.engines.node}; this server runs ${process.versions.node}.`,
      );
    const missing = await missingConfiguration(root, stagedPkg.arrakisRelease?.requiredEnv ?? [], env);
    if (missing.length)
      throw new UpdateError(
        `Release ${version} needs configuration that is not set: ${missing.join(', ')}. Nothing was changed.`,
      );

    const buildSteps = stagedPkg.arrakisRelease?.build ?? config.build;
    for (const step of buildSteps) {
      log(`Building ${version}: ${step.join(' ')}`);
      await runImpl(step[0], step.slice(1), { cwd: staged, env: buildEnvironment(env) });
    }
    // The installed baseline records files as they are after the build (a build may rewrite a tracked file).
    const builtFiles = {};
    for (const relative of Object.keys(files)) builtFiles[relative] = await hashFile(path.join(staged, relative));

    if (stageOnly) {
      state.staged = { version, at: new Date().toISOString() };
      await writeJson(paths.state, state);
      return { status: 'staged', version };
    }
    return await activateStaged({
      root,
      config,
      version,
      staged,
      builtFiles,
      modes,
      current,
      fetchImpl,
      settings,
      log,
      beforeActivate,
    });
  } finally {
    await release();
  }
}

async function baselineFor({ root, config, current, settings, fetchImpl, log }) {
  const paths = statePaths(root);
  const installed = await readJson(paths.installed);
  if (installed?.version === current && installed.files) return installed;
  // Installations from before the updater: rebuild the baseline from the verified release they were installed from.
  log(`No install record for ${current}; reading release v${current} to learn which files it manages.`);
  const releaseInfo = await releaseByTag({ repository: config.repository, tag: `v${current}`, settings, fetchImpl });
  if (!releaseInfo)
    throw new UpdateError(
      `Release v${current} was not found, so local changes cannot be told apart. Nothing was changed.`,
    );
  const workDir = path.join(paths.downloads, `baseline-${current}`);
  await fs.rm(workDir, { recursive: true, force: true });
  const fetched = await releaseFiles({ release: releaseInfo, config, settings, fetchImpl, workDir });
  const files = fetched.manifest
    ? Object.fromEntries(Object.entries(fetched.manifest.files).map(([name, entry]) => [name, entry.sha256]))
    : await hashArchive(fetched.archiveFile, config.generatedDirectories);
  await fs.rm(workDir, { recursive: true, force: true });
  return { version: current, files };
}

async function activateStaged({
  root,
  config,
  version,
  staged,
  builtFiles,
  modes,
  current,
  fetchImpl,
  settings,
  log,
  beforeActivate,
}) {
  const paths = statePaths(root);
  const baseline = await baselineFor({ root, config, current, settings, fetchImpl, log });
  const plan = await planActivation(root, baseline.files, builtFiles, { regenerable: config.generatedFiles ?? [] });
  if (plan.conflicts.length) {
    for (const conflict of plan.conflicts.slice(0, 25)) log(`Conflict: ${conflict.path} (${conflict.reason})`);
    throw new UpdateError(
      `Update to ${version} stopped: ${plan.conflicts.length} file(s) would overwrite local changes. Nothing was changed.`,
      { conflicts: plan.conflicts },
    );
  }
  // The running application is stopped only now: download, verification, build and conflict checks all passed.
  await beforeActivate(version);
  log(
    `Activating ${version}: ${plan.operations.filter((operation) => operation.type !== 'keep').length} file change(s)`,
  );
  let journal;
  try {
    journal = await activate({
      root,
      staged,
      plan,
      generatedDirectories: config.generatedDirectories,
      fromVersion: current,
      toVersion: version,
      modes,
      log,
    });
    journal.previousInstalled = baseline;
    await writeJson(paths.journal, journal);
    await writeJson(paths.installed, { version, files: builtFiles, installedAt: new Date().toISOString() });
  } catch (error) {
    log(`Activation failed (${error.message}); restoring ${current}.`);
    const partial = await readJson(paths.journal);
    if (partial) await rollback(root, partial, log);
    await fs.rm(paths.journal, { force: true });
    throw error;
  }
  await fs.rm(staged, { recursive: true, force: true });
  await fs.rm(path.join(paths.downloads, version), { recursive: true, force: true });
  return { status: 'activated', from: current, version };
}

/** After a healthy start: forget the journal and keep only the two newest backups. */
export async function confirmHealthy(root, log) {
  const paths = statePaths(root);
  const journal = await readJson(paths.journal);
  if (!journal) return;
  await fs.rm(paths.journal, { force: true });
  const state = await readJson(paths.state, {});
  delete state.staged;
  await writeJson(paths.state, state);
  const backups = (await fs.readdir(paths.backups).catch(() => [])).sort();
  for (const old of backups.slice(0, Math.max(0, backups.length - 2)))
    await fs.rm(path.join(paths.backups, old), { recursive: true, force: true });
  log(`Update to ${journal.toVersion} is healthy.`);
}

/** After a failed start: restore the previous version and never offer this one again automatically. */
export async function rollbackUnhealthy(root, log) {
  const paths = statePaths(root);
  const journal = await readJson(paths.journal);
  if (!journal) return null;
  log(`Version ${journal.toVersion} did not start cleanly; restoring ${journal.fromVersion}.`);
  await rollback(root, journal, log);
  if (journal.previousInstalled) await writeJson(paths.installed, journal.previousInstalled);
  const state = await readJson(paths.state, {});
  state.badVersions = [...new Set([...(state.badVersions ?? []), journal.toVersion])].slice(-20);
  await writeJson(paths.state, state);
  await fs.rm(paths.journal, { force: true });
  return journal;
}

export async function readProductConfig(root) {
  const pkg = await readJson(path.join(root, 'package.json'));
  const config = pkg?.arrakisRelease;
  if (!config?.repository || !config.assetPrefix || !Array.isArray(config.start))
    throw new UpdateError('package.json has no arrakisRelease configuration.');
  return { generatedDirectories: [], generatedFiles: [], build: [], ...config };
}
