import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  UpdateError,
  acquireLock,
  checkAndUpdate,
  compareVersions,
  confirmHealthy,
  insideWindow,
  missingConfiguration,
  readArchive,
  recover,
  rollbackUnhealthy,
  safeMemberPath,
  selectRelease,
  statePaths,
  updaterSettings,
} from '../../scripts/deployment/updater/updater.mjs';
import { buildReleaseManifest } from '../../scripts/deployment/build-release-manifest.mjs';

/**
 * Exercises the real updater against fake GitHub releases in a temporary install directory whose path contains a
 * space. No network, no npm: the build step is a stub that writes the generated output directory.
 */

type Entry = { name: string; content?: string | Buffer; mode?: number; type?: string; linkname?: string };

function header(name: string, size: number, type: string, mode: number, linkname = '') {
  const block = Buffer.alloc(512);
  block.write(name.slice(0, 100), 0, 100);
  block.write(`${mode.toString(8).padStart(7, '0')}\0`, 100);
  block.write('0000000\0', 108);
  block.write('0000000\0', 116);
  block.write(`${size.toString(8).padStart(11, '0')}\0`, 124);
  block.write('00000000000\0', 136);
  block.write('        ', 148);
  block.write(type, 156);
  block.write(linkname, 157, 100);
  block.write('ustar\0', 257);
  block.write('00', 263);
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
  return block;
}

const pad = (data: Buffer) => Buffer.concat([data, Buffer.alloc((512 - (data.length % 512)) % 512)]);

/** Minimal tar.gz writer (pax headers for long names), so hostile archives can be built on purpose. */
function tarGz(entries: Entry[], prefix = 'app/') {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const name = entry.name.startsWith('/') || entry.name.startsWith('..') ? entry.name : `${prefix}${entry.name}`;
    const body = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content ?? '');
    if (Buffer.byteLength(name) > 99) {
      const record = ` path=${name}\n`;
      let length = record.length;
      while (`${length}${record}`.length !== length) length = `${length}${record}`.length;
      const pax = Buffer.from(`${length}${record}`);
      blocks.push(header('PaxHeader', pax.length, 'x', 0o644), pad(pax));
    }
    const type = entry.type ?? '0';
    blocks.push(header(name, type === '0' ? body.length : 0, type, entry.mode ?? 0o644, entry.linkname));
    if (type === '0') blocks.push(pad(body));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const REPO = 'Owner/App';
const DL = `https://github.com/${REPO}/releases/download`;

function pkg(version: string, extra: Record<string, unknown> = {}) {
  return `${JSON.stringify(
    {
      name: 'app',
      version,
      arrakisRelease: {
        repository: REPO,
        assetPrefix: 'app',
        start: ['node', 'src/app.js'],
        build: [['fake-build']],
        generatedDirectories: ['node_modules', 'dist'],
        requiredEnv: ['TOKEN', 'REDIS_URL|REDIS_CLUSTER_NODES'],
        ...extra,
      },
    },
    null,
    2,
  )}\n`;
}

const V1: Record<string, string> = {
  'package.json': pkg('1.0.0'),
  'src/app.js': 'console.log("v1");\n',
  'src/retired.js': 'old\n',
  'src/retired edited.js': 'old too\n',
  'README.md': '# App\n',
  '.env.example': 'TOKEN=\n',
};
const V2: Record<string, string> = {
  'package.json': pkg('1.1.0'),
  'src/app.js': 'console.log("v2");\n',
  'src/new feature/handler one.js': 'export {};\n',
  'README.md': '# App\n',
  '.env.example': 'TOKEN=\nNEW_SETTING=\n',
  'scripts/run.sh': '#!/bin/sh\n',
};

type FakeRelease = { tag: string; prerelease?: boolean; files: Record<string, string>; entries?: Entry[] };
type Tamper = { checksum?: boolean; manifestFile?: boolean; noManifest?: boolean; digest?: string };

class FakeGitHub {
  assets = new Map<string, Buffer>();
  releases: Array<Record<string, unknown>> = [];
  calls: string[] = [];
  down = false;

  add({ tag, prerelease = false, files, entries }: FakeRelease, tamper: Tamper = {}) {
    const version = tag.slice(1);
    const name = `app-${version}.tar.gz`;
    const list: Entry[] =
      entries ??
      Object.entries(files).map(([file, content]) => ({
        name: file,
        content,
        mode: file.endsWith('.sh') ? 0o755 : 0o644,
      }));
    const archive = tarGz(list);
    const archiveSum = sha(archive);
    const manifestFiles: Record<string, { sha256: string }> = {};
    for (const entry of list)
      if ((entry.type ?? '0') === '0') manifestFiles[entry.name] = { sha256: sha(entry.content ?? '') };
    if (tamper.manifestFile) manifestFiles['src/app.js'] = { sha256: sha('something else') };
    const manifest = Buffer.from(
      JSON.stringify({ schemaVersion: 1, version, archive: { sha256: archiveSum }, files: manifestFiles }),
    );
    const sum = Buffer.from(`${tamper.checksum ? sha('nope') : archiveSum}  ${name}\n`);
    const assets: Array<Record<string, unknown>> = [];
    const publish = (assetName: string, data: Buffer, digest?: string) => {
      const url = `${DL}/${tag}/${assetName}`;
      this.assets.set(url, data);
      assets.push({
        name: assetName,
        browser_download_url: url,
        url: `https://api.github.com/assets/${assetName}`,
        digest,
      });
    };
    publish(name, archive, tamper.digest);
    publish(`${name}.sha256`, sum);
    if (!tamper.noManifest) publish(`app-${version}.manifest.json`, manifest);
    this.releases.unshift({ tag_name: tag, draft: false, prerelease, assets });
  }

  fetch = (input: string | URL) => Promise.resolve(this.respond(input));

  respond(input: string | URL) {
    const url = String(input);
    this.calls.push(url);
    if (this.down) throw new TypeError('fetch failed');
    if (url.startsWith(`https://api.github.com/repos/${REPO}/releases?`))
      return Response.json(this.releases, { headers: { etag: `"${this.releases.length}"` } });
    const tagMatch = /\/releases\/tags\/(.+)$/.exec(url);
    if (tagMatch) {
      const release = this.releases.find((entry) => entry.tag_name === decodeURIComponent(tagMatch[1]));
      return release ? Response.json(release) : new Response('missing', { status: 404 });
    }
    const asset = this.assets.get(url);
    if (!asset) return new Response('missing', { status: 404 });
    return new Response(new Uint8Array(asset), { headers: { 'content-length': String(asset.length) } });
  }
}

let root: string;
let github: FakeGitHub;
const messages: string[] = [];
const log = (message: string) => messages.push(message);
const env = { TOKEN: 'synthetic-token', REDIS_URL: 'redis://127.0.0.1:6379', PATH: process.env.PATH };
const settings = (overrides: Record<string, string> = {}) =>
  updaterSettings({ AUTO_UPDATE_ENABLED: 'true', ...overrides });
const config = {
  repository: REPO,
  assetPrefix: 'app',
  start: ['node', 'src/app.js'],
  build: [['fake-build']],
  generatedDirectories: ['node_modules', 'dist'],
  generatedFiles: [],
};

/** The stub build writes a generated directory, like `npm ci` and `next build` would. */
const runImpl = async (_command: string, _args: string[], options: { cwd: string }) => {
  await mkdir(path.join(options.cwd, 'dist'), { recursive: true });
  const version = JSON.parse(await readFile(path.join(options.cwd, 'package.json'), 'utf8')).version;
  await writeFile(path.join(options.cwd, 'dist', 'built.txt'), `built ${version}\n`);
  return '';
};
const failingBuild = () => Promise.reject(new UpdateError('npm run build failed (exit 1).'));

async function install(files: Record<string, string>) {
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist', 'built.txt'), 'built 1.0.0\n');
}

/** Operator files in several places, including nested folders, spaces and restrictive permissions. */
const CUSTOM: Record<string, { content: string; mode: number }> = {
  '.env': { content: 'TOKEN=real-looking-but-synthetic\n', mode: 0o600 },
  'certs/rabbit mq/ca.pem': { content: '-----BEGIN CERTIFICATE-----\nsynthetic\n', mode: 0o644 },
  'certs/rabbit mq/client key.pem': { content: '-----BEGIN PRIVATE KEY-----\nsynthetic\n', mode: 0o600 },
  'custom dir/nested/deeper/notes.txt': { content: 'keep me\n', mode: 0o640 },
  'src/local-plugin.js': { content: 'export const mine = true;\n', mode: 0o644 },
  'uploads/logo final.png': { content: 'png', mode: 0o644 },
};

async function addCustomFiles() {
  for (const [file, { content, mode }] of Object.entries(CUSTOM)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
    await chmod(path.join(root, file), mode);
  }
  await chmod(path.join(root, 'certs'), 0o750);
}

/** Path → hash and permission bits of everything except updater state. */
async function snapshot(directory = root, prefix = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (relative === '.arrakis') continue;
    const full = path.join(directory, entry.name);
    const stat = await lstat(full);
    if (entry.isDirectory()) {
      result[`${relative}/`] = (stat.mode & 0o777).toString(8);
      Object.assign(result, await snapshot(full, relative));
    } else result[relative] = `${sha(await readFile(full))}:${(stat.mode & 0o777).toString(8)}`;
  }
  return result;
}

async function expectCustomFilesIntact() {
  for (const [file, { content, mode }] of Object.entries(CUSTOM)) {
    expect(await readFile(path.join(root, file), 'utf8')).toBe(content);
    expect((await lstat(path.join(root, file))).mode & 0o777).toBe(mode);
  }
  expect((await lstat(path.join(root, 'certs'))).mode & 0o777).toBe(0o750);
}

const update = (overrides: Partial<Parameters<typeof checkAndUpdate>[0]> = {}) =>
  checkAndUpdate({ root, config, settings: settings(), fetchImpl: github.fetch, log, runImpl, env, ...overrides });

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'arrakis updater '));
  github = new FakeGitHub();
  messages.length = 0;
  github.add({ tag: 'v1.0.0', files: V1 });
  await install(V1);
  await addCustomFiles();
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('automatic update', () => {
  it('installs a verified release and leaves every custom file, folder and permission untouched', async () => {
    github.add({ tag: 'v1.1.0', files: V2 });
    const result = await update();
    expect(result).toMatchObject({ status: 'activated', from: '1.0.0', version: '1.1.0' });
    await expectCustomFilesIntact();
    expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).version).toBe('1.1.0');
    expect(await readFile(path.join(root, 'src/app.js'), 'utf8')).toBe(V2['src/app.js']);
    expect(await readFile(path.join(root, 'src/new feature/handler one.js'), 'utf8')).toBe('export {};\n');
    expect((await lstat(path.join(root, 'scripts/run.sh'))).mode & 0o111).not.toBe(0);
    expect(await readFile(path.join(root, 'dist/built.txt'), 'utf8')).toBe('built 1.1.0\n');
    // A retired file is removed only because it was still exactly what 1.0.0 installed.
    await expect(lstat(path.join(root, 'src/retired.js'))).rejects.toThrow();
    // .env is never written: not even its modification is allowed to change.
    expect(await readFile(path.join(root, '.env'), 'utf8')).toBe(CUSTOM['.env'].content);
    const installed = JSON.parse(await readFile(statePaths(root).installed, 'utf8'));
    expect(installed.version).toBe('1.1.0');
    expect(Object.keys(installed.files)).not.toContain('.env');
    await confirmHealthy(root, log);
    await expect(lstat(statePaths(root).journal)).rejects.toThrow();
  });

  it('keeps a retired file the operator changed', async () => {
    await writeFile(path.join(root, 'src/retired edited.js'), 'my change\n');
    github.add({ tag: 'v1.1.0', files: V2 });
    await update();
    expect(await readFile(path.join(root, 'src/retired edited.js'), 'utf8')).toBe('my change\n');
  });

  it('stops before changing anything when a managed file was modified locally', async () => {
    await writeFile(path.join(root, 'src/app.js'), 'console.log("patched by the operator");\n');
    const before = await snapshot();
    github.add({ tag: 'v1.1.0', files: V2 });
    await expect(update()).rejects.toThrow(/would overwrite local changes\. Nothing was changed/);
    expect(await snapshot()).toEqual(before);
    expect(messages.some((line) => line.includes('Conflict: src/app.js'))).toBe(true);
  });

  it('refuses to overwrite an unmanaged file at a path the new release introduces', async () => {
    await writeFile(path.join(root, 'scripts-placeholder'), 'x');
    await mkdir(path.join(root, 'scripts'), { recursive: true });
    await writeFile(path.join(root, 'scripts/run.sh'), '#!/bin/sh\necho mine\n');
    const before = await snapshot();
    github.add({ tag: 'v1.1.0', files: V2 });
    await expect(update()).rejects.toThrow(/Nothing was changed/);
    expect(await snapshot()).toEqual(before);
  });

  it('refuses to write through a symbolic link', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'arrakis outside '));
    try {
      await rm(path.join(root, 'src'), { recursive: true });
      await symlink(outside, path.join(root, 'src'));
      github.add({ tag: 'v1.1.0', files: V2 });
      await expect(update()).rejects.toThrow(/Nothing was changed/);
      expect(await readdir(outside)).toEqual([]);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('rejects a checksum mismatch, a manifest mismatch and a disagreeing GitHub digest', async () => {
    const before = await snapshot();
    github.add({ tag: 'v1.1.0', files: V2 }, { checksum: true, noManifest: true });
    await expect(update()).rejects.toThrow(/checksum does not match/);
    github.releases.shift();
    github.add({ tag: 'v1.1.0', files: V2 }, { manifestFile: true });
    await expect(update()).rejects.toThrow(/does not match the manifest/);
    github.releases.shift();
    github.add({ tag: 'v1.1.0', files: V2 }, { digest: `sha256:${sha('other')}` });
    await expect(update()).rejects.toThrow(/digest disagrees/);
    expect(await snapshot()).toEqual(before);
  });

  it('rejects hostile archives: parent paths, absolute paths, links and reserved files', async () => {
    const before = await snapshot();
    const hostile: Entry[][] = [
      [{ name: '../escape.txt', content: 'x' }],
      [{ name: '/etc/passwd', content: 'x' }],
      [{ name: 'link', type: '2', linkname: '/etc' }],
      [{ name: 'hard', type: '1', linkname: 'app/package.json' }],
      [{ name: '.env', content: 'TOKEN=overwritten' }],
      [{ name: '.arrakis/installed.json', content: '{}' }],
      [{ name: 'node_modules/evil/index.js', content: 'x' }],
    ];
    for (const entries of hostile) {
      github.releases = github.releases.filter((release) => release.tag_name !== 'v1.1.0');
      github.add({
        tag: 'v1.1.0',
        files: {},
        entries: [{ name: 'package.json', content: V2['package.json'] }, ...entries],
      });
      await expect(update()).rejects.toBeInstanceOf(UpdateError);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('rejects a corrupted or truncated archive', async () => {
    const file = path.join(root, '.arrakis-test.tar.gz');
    const good = tarGz([{ name: 'a.txt', content: 'x'.repeat(2000) }]);
    const corrupted = Buffer.from(good);
    corrupted[corrupted.length - 12] ^= 0xff;
    await writeFile(file, corrupted);
    await expect(readArchive(file, () => Promise.resolve())).rejects.toThrow();
    const { gunzipSync } = await import('node:zlib');
    await writeFile(file, gzipSync(gunzipSync(good).subarray(0, 700)));
    await expect(readArchive(file, () => Promise.resolve())).rejects.toThrow(/truncated|corrupted/);
    await rm(file);
  });

  it('does not activate a release that needs configuration this server lacks', async () => {
    const before = await snapshot();
    github.add({
      tag: 'v1.1.0',
      files: { ...V2, 'package.json': pkg('1.1.0', { requiredEnv: ['TOKEN', 'NEW_SECRET'] }) },
    });
    await expect(update()).rejects.toThrow(/NEW_SECRET\. Nothing was changed/);
    expect(await snapshot()).toEqual(before);
  });

  it('keeps the running version when the build fails', async () => {
    const before = await snapshot();
    github.add({ tag: 'v1.1.0', files: V2 });
    await expect(update({ runImpl: failingBuild })).rejects.toThrow(/build failed/);
    expect(await snapshot()).toEqual(before);
  });

  it('survives a GitHub outage without touching anything', async () => {
    const before = await snapshot();
    github.down = true;
    await expect(update()).rejects.toThrow(/fetch failed/);
    expect(await snapshot()).toEqual(before);
  });

  it('reports up to date, honours disabled, and reuses the release list with a conditional request', async () => {
    expect(await update()).toEqual({ status: 'current', version: '1.0.0' });
    expect(await update({ settings: settings({ AUTO_UPDATE_ENABLED: 'false' }) })).toEqual({ status: 'disabled' });
    const state = JSON.parse(await readFile(statePaths(root).state, 'utf8'));
    expect(state.etag).toBe('"1"');
  });

  it('rolls an unhealthy update back exactly and never offers that version again', async () => {
    const before = await snapshot();
    github.add({ tag: 'v1.1.0', files: V2 });
    await update();
    await rollbackUnhealthy(root, log);
    expect(await snapshot()).toEqual(before);
    expect(JSON.parse(await readFile(statePaths(root).installed, 'utf8')).version).toBe('1.0.0');
    expect(await update()).toEqual({ status: 'current', version: '1.0.0' });
  });

  it('restores the previous version on the next start after an interrupted update', async () => {
    const before = await snapshot();
    github.add({ tag: 'v1.1.0', files: V2 });
    await update();
    // The container stopped before the new version proved healthy.
    await recover(root, log);
    expect(await snapshot()).toEqual(before);
    await expectCustomFilesIntact();
  });

  it('stops the application only after verification, build and conflict checks pass', async () => {
    const order: string[] = [];
    await writeFile(path.join(root, 'src/app.js'), 'edited\n');
    github.add({ tag: 'v1.1.0', files: V2 });
    await expect(update({ beforeActivate: () => Promise.resolve(void order.push('stop')) })).rejects.toThrow();
    expect(order).toEqual([]);
    await writeFile(path.join(root, 'src/app.js'), V1['src/app.js']);
    await update({ beforeActivate: () => Promise.resolve(void order.push('stop')) });
    expect(order).toEqual(['stop']);
  });

  it('allows one update at a time', async () => {
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 10000)']);
    try {
      await mkdir(statePaths(root).base, { recursive: true });
      await writeFile(statePaths(root).lock, JSON.stringify({ pid: holder.pid, at: Date.now() }));
      await expect(acquireLock(root)).rejects.toThrow(/already running/);
      await expect(update()).rejects.toThrow(/already running/);
    } finally {
      holder.kill();
    }
    // A lock left by a process that no longer exists is taken over.
    await writeFile(statePaths(root).lock, JSON.stringify({ pid: 2 ** 22 + 7, at: Date.now() }));
    const release = await acquireLock(root);
    await release();
  });

  it('works with releases published before manifests existed (checksum plus archive only)', async () => {
    github.releases = [];
    github.add({ tag: 'v1.0.0', files: V1 }, { noManifest: true });
    github.add({ tag: 'v1.1.0', files: V2 }, { noManifest: true });
    expect(await update()).toMatchObject({ status: 'activated', version: '1.1.0' });
    await expectCustomFilesIntact();
  });
});

describe('release selection and settings', () => {
  const list = [
    { tag_name: 'v2.1.0-beta.1', prerelease: true },
    { tag_name: 'v2.0.1' },
    { tag_name: 'v2.0.0' },
    { tag_name: 'v3.0.0', draft: true },
  ];
  it('picks the newest stable release, or prereleases when asked, and never a draft', () => {
    expect(selectRelease(list, { current: '2.0.0', channel: 'stable', pin: null })?.tag_name).toBe('v2.0.1');
    expect(selectRelease(list, { current: '2.0.0', channel: 'prerelease', pin: null })?.tag_name).toBe('v2.1.0-beta.1');
    expect(selectRelease(list, { current: '2.0.1', channel: 'stable', pin: null })).toBeNull();
    expect(selectRelease(list, { current: '2.0.0', channel: 'stable', pin: null, bad: ['2.0.1'] })).toBeNull();
  });
  it('holds a pinned version and never downgrades to it', () => {
    expect(selectRelease(list, { current: '2.0.0', channel: 'stable', pin: 'v2.0.0' })).toBeNull();
    expect(selectRelease(list, { current: '1.9.0', channel: 'stable', pin: 'v2.0.0' })?.tag_name).toBe('v2.0.0');
    expect(selectRelease(list, { current: '2.0.1', channel: 'stable', pin: 'v2.0.0' })).toBeNull();
  });
  it('orders prereleases below their release', () => {
    expect(compareVersions('2.1.0-beta.1', '2.1.0')).toBeLessThan(0);
    expect(compareVersions('v2.1.0', '2.0.9')).toBeGreaterThan(0);
  });
  it('bounds settings and validates the maintenance window, pin and token', () => {
    expect(updaterSettings({})).toMatchObject({
      enabled: true,
      channel: 'stable',
      pin: null,
      intervalMs: 6 * 3_600_000,
    });
    expect(updaterSettings({ AUTO_UPDATE_INTERVAL_HOURS: '0' }).intervalMs).toBe(3_600_000);
    expect(updaterSettings({ RELEASE_TAG: '2.1.0' }).pin).toBe('v2.1.0');
    expect(() => updaterSettings({ AUTO_UPDATE_WINDOW_UTC: '3am' })).toThrow();
    expect(() => updaterSettings({ RELEASE_TAG: 'main; rm -rf /' })).toThrow();
    expect(() => updaterSettings({ AUTO_UPDATE_GITHUB_TOKEN: 'bad token' })).toThrow();
    expect(insideWindow('23:00-02:00', new Date('2026-01-01T01:30:00Z'))).toBe(true);
    expect(insideWindow('23:00-02:00', new Date('2026-01-01T12:00:00Z'))).toBe(false);
    expect(insideWindow(null)).toBe(true);
  });
  it('reads configuration presence from the environment or .env without changing it', async () => {
    expect(await missingConfiguration(root, ['TOKEN', 'REDIS_URL|REDIS_CLUSTER_NODES', 'OTHER'], {})).toEqual([
      'REDIS_URL|REDIS_CLUSTER_NODES',
      'OTHER',
    ]);
  });
  it('validates archive member paths', () => {
    expect(safeMemberPath('app/src/a b.js')).toBe('src/a b.js');
    expect(safeMemberPath('app/')).toBeNull();
    expect(() => safeMemberPath('app/../../x')).toThrow();
    expect(() => safeMemberPath('C:/x')).toThrow();
  });
  it('builds a manifest that matches the archive', async () => {
    const file = path.join(root, '.arrakis-test.tar.gz');
    await writeFile(
      file,
      tarGz([
        { name: 'a b/c.txt', content: 'hi' },
        { name: 'run.sh', content: '#!/bin/sh', mode: 0o755 },
      ]),
    );
    const manifest = await buildReleaseManifest(file, '1.2.3');
    expect(manifest.files).toEqual({
      'a b/c.txt': { sha256: sha('hi'), size: 2, mode: 0o644 },
      'run.sh': { sha256: sha('#!/bin/sh'), size: 9, mode: 0o755 },
    });
    expect(manifest.archive.sha256).toBe(sha(await readFile(file)));
  });
});

describe('supervisor', () => {
  const supervisor = path.resolve('scripts/deployment/updater/supervisor.mjs');
  const runSupervisor = async (app: string, signalAfterReady = false) => {
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'x',
        version: '1.0.0',
        arrakisRelease: { ...config, start: ['node', 'app.js'], readyPattern: 'is listening' },
      }),
    );
    await writeFile(path.join(root, 'app.js'), app);
    const child = spawn(process.execPath, [supervisor], {
      cwd: root,
      env: { PATH: process.env.PATH, AUTO_UPDATE_ENABLED: 'false' } as unknown as NodeJS.ProcessEnv,
    });
    let output = '';
    child.stdout!.on('data', (chunk) => {
      output += chunk;
      if (signalAfterReady && output.includes('is listening')) child.kill('SIGINT');
    });
    const code = await new Promise<number | null>((resolve) => child.on('exit', resolve));
    return { code, output };
  };

  it('forwards the panel stop signal and exits with the application exit code', async () => {
    const graceful = await runSupervisor(
      "process.on('SIGINT', () => { console.log('graceful'); process.exit(0); }); console.log('App is listening'); setInterval(() => {}, 1000);",
      true,
    );
    expect(graceful.code).toBe(0);
    expect(graceful.output).toContain('graceful');
  });

  it('does not restart a crashing application in a loop', async () => {
    const crashed = await runSupervisor("console.log('starting'); process.exit(3);");
    expect(crashed.code).toBe(3);
    expect(crashed.output.match(/starting/g)).toHaveLength(1);
    await expectCustomFilesIntact();
  });
});
