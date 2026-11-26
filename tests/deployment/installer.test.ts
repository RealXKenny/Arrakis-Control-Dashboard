import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPterodactylEgg } from '../../scripts/deployment/build-pterodactyl-egg.mjs';

/**
 * Runs the egg's real installation script (bash + jq + tar + sha256sum) in a sandbox with no network: `curl` is
 * replaced by a shim that serves fixtures, `npm`/`apt-get`/`chown` only log, and the install directory is a temp
 * folder. Nothing outside the sandbox is touched.
 *
 * Needs bash, jq, tar, sha256sum and find on PATH (CI's Ubuntu runners have them; locally put jq on PATH).
 */
const have = (tool: string) => spawnSync('bash', ['-c', `command -v ${tool}`]).status === 0;
const ready = ['bash', 'jq', 'tar', 'sha256sum', 'find', 'readlink', 'awk'].every(have);
const posix = (p: string) => (process.platform === 'win32' ? execFileSync('cygpath', ['-u', p]).toString().trim() : p);

const API = 'https://api.github.com/repos/RealXKenny/Arrakis-Control-Dashboard/releases';
const CDN = 'https://downloads.test/release';
const fixtureName = (url: string) => url.replace(/[^A-Za-z0-9._-]/g, '_');

/** Minimal tar writer, so hostile archives (parent paths, absolute paths, symlinks) can be built on purpose. */
function tarGz(entries: Array<{ name: string; content?: string; symlink?: string; hardlink?: string }>) {
  const blocks: Buffer[] = [];
  for (const entry of entries) {
    const body = Buffer.from(entry.content ?? '');
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('        ', 148);
    header.write(entry.symlink ? '2' : entry.hardlink ? '1' : '0', 156);
    if (entry.symlink ?? entry.hardlink) header.write((entry.symlink ?? entry.hardlink)!, 157, 100);
    header.write('ustar\0', 257);
    header.write('00', 263);
    const sum = [...header].reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148);
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

const goodArchive = () =>
  tarGz([
    { name: 'arrakis-control-dashboard/package.json', content: '{"name":"arrakis"}' },
    { name: 'arrakis-control-dashboard/scripts/server-launcher.mjs', content: '// launcher' },
  ]);
const sha = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

let root: string;
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'egg-install-'));
});
afterAll(() => {
  // Each test removes its own sandbox below; this only guards against leftovers from a failed assertion.
});

type Scenario = {
  /** Release JSON returned for the metadata URL. A string is served verbatim. */
  release?: unknown;
  /** Extra downloadable files by URL. */
  files?: Record<string, Buffer | string>;
  env?: Record<string, string>;
  /** Which metadata URL the installer is expected to ask for. */
  metadataUrl?: string;
};

function install({ release, files = {}, env = {}, metadataUrl = `${API}/latest` }: Scenario) {
  const sandbox = path.join(root, 'sandbox');
  const bin = path.join(sandbox, 'bin');
  const fixtures = path.join(sandbox, 'fixtures');
  const server = path.join(sandbox, 'server');
  mkdirSync(bin, { recursive: true });
  mkdirSync(fixtures, { recursive: true });
  mkdirSync(server, { recursive: true });
  const shim = (name: string, body: string) => {
    const file = path.join(bin, name);
    writeFileSync(file, `#!/bin/bash\n${body}\n`);
    chmodSync(file, 0o755);
  };
  const realRm = spawnSync('bash', ['-c', 'command -v rm']).stdout.toString().trim();
  shim('apt-get', 'echo "apt-get $*" >> "$SANDBOX/commands.log"');
  shim('chown', 'echo "chown $*" >> "$SANDBOX/commands.log"');
  shim('npm', 'echo "npm $* (in $(pwd))" >> "$SANDBOX/commands.log"');
  // The script's cleanup of apt lists must never reach the machine running the tests.
  shim('rm', 'for a in "$@"; do case "$a" in /var/lib/*) exit 0;; esac; done\nexec "$REAL_RM" "$@"');
  shim(
    'curl',
    [
      'url=""; out=""',
      'while [ $# -gt 0 ]; do case "$1" in --output) out="$2"; shift 2;; --header|--retry) shift 2;; --*) shift;; *) url="$1"; shift;; esac; done',
      'echo "$url" >> "$SANDBOX/curl.log"',
      'name=$(printf "%s" "$url" | sed "s#[^A-Za-z0-9._-]#_#g")',
      '[ -f "$SANDBOX/fixtures/$name" ] || exit 22',
      'cp "$SANDBOX/fixtures/$name" "$out"',
    ].join('\n'),
  );
  if (release !== undefined)
    writeFileSync(
      path.join(fixtures, fixtureName(metadataUrl)),
      typeof release === 'string' ? release : JSON.stringify(release),
    );
  for (const [url, content] of Object.entries(files)) writeFileSync(path.join(fixtures, fixtureName(url)), content);

  const script = createPterodactylEgg().scripts.installation.script.replaceAll('/mnt/server', posix(server));
  const scriptFile = path.join(sandbox, 'install.sh');
  writeFileSync(scriptFile, script);
  const run = spawnSync('bash', [scriptFile], {
    env: {
      ...process.env,
      PATH: [bin, process.env.PATH].join(path.delimiter),
      SANDBOX: posix(sandbox),
      REAL_RM: realRm,
      ...env,
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  const read = (name: string) =>
    existsSync(path.join(sandbox, name)) ? readFileSync(path.join(sandbox, name), 'utf8') : '';
  const result = {
    code: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    curls: read('curl.log').split('\n').filter(Boolean),
    commands: read('commands.log').split('\n').filter(Boolean),
    extracted: readdirSync(server, { recursive: true }).map(String),
    outside: existsSync(path.join(root, 'escape.txt')) || existsSync(path.join(sandbox, 'escape.txt')),
    root,
  };
  rmSync(sandbox, { recursive: true, force: true });
  return result;
}

const releaseWith = (archive: Buffer, options: { checksum?: string | null; version?: string } = {}) => {
  const version = options.version ?? '2.1.0';
  const archiveName = `arrakis-control-dashboard-${version}.tar.gz`;
  const assets = [
    { name: 'egg-arrakis-control-dashboard.json', browser_download_url: `${CDN}/egg.json` },
    { name: archiveName, browser_download_url: `${CDN}/${archiveName}` },
  ];
  const files: Record<string, Buffer | string> = { [`${CDN}/${archiveName}`]: archive };
  if (options.checksum !== null) {
    assets.push({ name: `${archiveName}.sha256`, browser_download_url: `${CDN}/${archiveName}.sha256` });
    files[`${CDN}/${archiveName}.sha256`] = options.checksum ?? `${sha(archive)}  ${archiveName}\n`;
  }
  return { release: { tag_name: `v${version}`, tarball_url: `${API}/tarball/v${version}`, assets }, files };
};

vi.setConfig({ testTimeout: 60_000 });
const suite = ready ? describe : describe.skip;
const cleanup = () => rmSync(root, { recursive: true, force: true });

suite('Pterodactyl egg installer (sandboxed, no network)', () => {
  it('downloads, verifies and extracts a good release, then builds without running dependency scripts', () => {
    const run = install(releaseWith(goodArchive()));
    expect(run.stderr).not.toContain('WARNING');
    expect(run.code).toBe(0);
    expect(run.stdout).toContain('Source archive checksum verified.');
    expect(run.curls[0]).toBe(`${API}/latest`);
    expect(run.extracted).toContain('package.json');
    expect(run.extracted).toContain(path.join('scripts', 'server-launcher.mjs'));
    const npm = run.commands.filter((line) => line.startsWith('npm '));
    expect(npm[0]).toContain('npm ci --ignore-scripts --no-audit --no-fund');
    expect(npm[1]).toContain('npm run build');
    expect(npm[2]).toContain('npm prune --omit=dev');
    cleanup();
  });

  it('rejects an archive whose checksum does not match, before extracting or building anything', () => {
    const archive = goodArchive();
    const tampered = releaseWith(archive, { checksum: `${sha(Buffer.from('something else'))}  x\n` });
    const run = install(tampered);
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    expect(run.commands.filter((line) => line.startsWith('npm '))).toEqual([]);
    cleanup();
  });

  it('rejects an archive that was altered after its checksum was published', () => {
    const good = goodArchive();
    const published = releaseWith(good);
    const evil = tarGz([{ name: 'arrakis-control-dashboard/package.json', content: '{"name":"evil"}' }]);
    published.files[`${CDN}/arrakis-control-dashboard-2.1.0.tar.gz`] = evil;
    const run = install(published);
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    cleanup();
  });

  it.each([
    ['empty', ''],
    ['too short', 'abc123  file\n'],
    ['not hex', `${'z'.repeat(64)}  file\n`],
    ['uppercase', `${'A'.repeat(64)}  file\n`],
    ['html error page', '<html>404</html>'],
  ])('rejects a malformed checksum file (%s)', (_label, content) => {
    const run = install(releaseWith(goodArchive(), { checksum: content }));
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    expect(run.commands.filter((line) => line.startsWith('npm '))).toEqual([]);
    cleanup();
  });

  it('fails closed when a release publishes no checksum, and says why', () => {
    const run = install(releaseWith(goodArchive(), { checksum: null }));
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('cannot be verified');
    expect(run.extracted).toEqual([]);
    expect(run.curls).toEqual([`${API}/latest`]);
    cleanup();
  });

  it('fails closed on a release with an archive but no checksum even when unverified installs are allowed', () => {
    const run = install({
      ...releaseWith(goodArchive(), { checksum: null }),
      env: { ALLOW_UNVERIFIED_RELEASE: 'true' },
    });
    expect(run.code).toBe(1);
    expect(run.extracted).toEqual([]);
    cleanup();
  });

  it('installs an old release with no assets only when the operator explicitly allows it, with a loud warning', () => {
    const legacy = { tag_name: 'v1.0.0', tarball_url: `${API}/tarball/v1.0.0`, assets: [] };
    const files = { [`${API}/tarball/v1.0.0`]: goodArchive() };
    const refused = install({ release: legacy, files });
    expect(refused.code).toBe(1);
    expect(refused.extracted).toEqual([]);
    cleanup();

    root = mkdtempSync(path.join(tmpdir(), 'egg-install-'));
    const allowed = install({ release: legacy, files, env: { ALLOW_UNVERIFIED_RELEASE: 'true' } });
    expect(allowed.code).toBe(0);
    expect(allowed.stderr).toContain('WARNING: ALLOW_UNVERIFIED_RELEASE is true');
    expect(allowed.extracted).toContain('package.json');
    cleanup();
  });

  it('an override other than the exact word true does not relax verification', () => {
    const legacy = { tag_name: 'v1.0.0', tarball_url: `${API}/tarball/v1.0.0`, assets: [] };
    for (const value of ['TRUE', '1', 'yes', 'true ', '']) {
      root = mkdtempSync(path.join(tmpdir(), 'egg-install-'));
      const run = install({
        release: legacy,
        files: { [`${API}/tarball/v1.0.0`]: goodArchive() },
        env: { ALLOW_UNVERIFIED_RELEASE: value },
      });
      expect(run.code, JSON.stringify(value)).toBe(1);
      cleanup();
    }
  });

  it('pins an exact version through RELEASE_TAG and asks GitHub for that tag only', () => {
    const pinned = releaseWith(goodArchive(), { version: '2.0.5' });
    const run = install({ ...pinned, env: { RELEASE_TAG: 'v2.0.5' }, metadataUrl: `${API}/tags/v2.0.5` });
    expect(run.code).toBe(0);
    expect(run.curls[0]).toBe(`${API}/tags/v2.0.5`);
    cleanup();
  });

  it.each([
    'v2.1',
    '2.1.0',
    'latest; rm -rf /',
    '../../x',
    'v2.1.0/../../x',
    'v2.1.0\nlatest',
    'v2.1.0-beta',
    'V2.1.0',
  ])('rejects a malformed RELEASE_TAG (%j) without making any request', (tag) => {
    const run = install({ ...releaseWith(goodArchive()), env: { RELEASE_TAG: tag } });
    expect(run.code).toBe(1);
    expect(run.stderr).toContain('RELEASE_TAG must be');
    expect(run.curls).toEqual([]);
    expect(run.extracted).toEqual([]);
    cleanup();
  });

  it.each([
    ['not JSON', '<html>rate limited</html>'],
    ['an empty body', ''],
    ['JSON without assets', '{"tag_name":"v2.1.0"}'],
    ['assets that is not a list', '{"assets":"nope"}'],
    ['a JSON array', '[]'],
  ])('fails cleanly on release metadata that is %s', (_label, body) => {
    const run = install({ release: body });
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    expect(run.commands.filter((line) => line.startsWith('npm '))).toEqual([]);
    cleanup();
  });

  it('ignores assets whose names merely resemble the archive', () => {
    const archive = goodArchive();
    const decoys = [
      'xarrakis-control-dashboard-2.1.0.tar.gz',
      'arrakis-control-dashboard-2.1.0.tar.gz.evil',
      'arrakis-control-dashboard-2.1.tar.gz',
      'arrakis-control-dashboard-2.1.0.zip',
    ].map((name) => ({ name, browser_download_url: `${CDN}/decoy/${name}` }));
    const release = { tag_name: 'v2.1.0', assets: decoys };
    const files = Object.fromEntries(decoys.map((asset) => [asset.browser_download_url, archive]));
    const run = install({ release, files });
    expect(run.code).toBe(1);
    expect(run.extracted).toEqual([]);
    expect(run.curls).toEqual([`${API}/latest`]);
    cleanup();
  });

  it('fails when a download fails, extracting nothing', () => {
    const run = install({
      release: {
        assets: [
          { name: 'arrakis-control-dashboard-2.1.0.tar.gz', browser_download_url: `${CDN}/missing.tar.gz` },
          { name: 'arrakis-control-dashboard-2.1.0.tar.gz.sha256', browser_download_url: `${CDN}/missing.sha256` },
        ],
      },
    });
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    expect(run.commands.filter((line) => line.startsWith('npm '))).toEqual([]);
    cleanup();
  });

  it('does not write outside the install directory even for a correctly checksummed hostile archive', () => {
    const hostile = tarGz([
      { name: 'arrakis-control-dashboard/package.json', content: '{}' },
      { name: 'arrakis-control-dashboard/../../escape.txt', content: 'escaped' },
      { name: '../escape.txt', content: 'escaped' },
      { name: '/tmp/arrakis-absolute-escape.txt', content: 'escaped' },
    ]);
    const run = install(releaseWith(hostile));
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    expect(run.stderr).toContain('absolute or parent-directory paths');
    expect(run.outside).toBe(false);
    expect(existsSync('/tmp/arrakis-absolute-escape.txt')).toBe(false);
    cleanup();
  });

  it('refuses an archive containing a symbolic link that leaves the install directory', () => {
    const linked = tarGz([
      { name: 'arrakis-control-dashboard/package.json', content: '{}' },
      { name: 'arrakis-control-dashboard/leak', symlink: '/' },
    ]);
    const run = install(releaseWith(linked));
    // Some platforms cannot create symlinks at all; either way nothing may be built from such an archive.
    expect(run.commands.filter((line) => line.startsWith('npm '))).toEqual([]);
    expect(run.code).not.toBe(0);
    cleanup();
  });

  it('cannot be made to write through an archive-supplied symbolic link into another directory', () => {
    const outside = path.join(root, 'outside-dir');
    mkdirSync(outside, { recursive: true });
    const archive = tarGz([
      { name: 'arrakis-control-dashboard/package.json', content: '{}' },
      { name: 'arrakis-control-dashboard/out', symlink: posix(outside) },
      { name: 'arrakis-control-dashboard/out/pwned.txt', content: 'written through a symlink' },
    ]);
    const run = install(releaseWith(archive));
    // The archive is inspected before extraction, so a link is refused with nothing written anywhere.
    expect(run.extracted).toEqual([]);
    expect(run.stderr).toContain('links or special files');
    expect(existsSync(path.join(outside, 'pwned.txt')), 'a file was written outside the install directory').toBe(false);
    expect(run.commands.filter((line) => line.startsWith('npm '))).toEqual([]);
    expect(run.code).not.toBe(0);
    cleanup();
  });

  it('cannot be made to overwrite an outside file through an archive-supplied hard link', () => {
    const outside = path.join(root, 'outside-file.txt');
    writeFileSync(outside, 'original');
    const archive = tarGz([
      { name: 'arrakis-control-dashboard/package.json', content: '{}' },
      { name: 'arrakis-control-dashboard/hard', hardlink: posix(outside) },
      { name: 'arrakis-control-dashboard/hard', content: 'overwritten through a hard link' },
    ]);
    const run = install(releaseWith(archive));
    expect(run.code).not.toBe(0);
    expect(run.extracted).toEqual([]);
    expect(readFileSync(outside, 'utf8')).toBe('original');
    cleanup();
  });
});
