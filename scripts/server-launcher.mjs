import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { get } from 'node:http';
import { access, lstat, mkdir, readlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { migrateEnvFile } from './maintenance/migrate-env.mjs';

const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_PORT = '2008';
const require = createRequire(import.meta.url);

// Kept in this standalone launcher so production startup needs no TypeScript log imports.
function formatLogLine(scope, level, message) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const timestamp = `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
  // Same colour policy as the application logger (LOG_COLOR, NO_COLOR, FORCE_COLOR, terminal or Pterodactyl).
  const mode = process.env.LOG_COLOR?.trim().toLowerCase() || 'auto';
  const colour =
    mode === 'always' || mode === 'true'
      ? true
      : mode === 'never' || mode === 'false' || process.env.NO_COLOR !== undefined || process.env.TERM === 'dumb'
        ? false
        : process.env.FORCE_COLOR !== undefined
          ? process.env.FORCE_COLOR !== '0'
          : Boolean(process.stdout.isTTY || process.env.P_SERVER_UUID?.trim());
  const paint = (text, color) => (colour ? `\u001b[${color}m${text}\u001b[0m` : text);
  const [icon, levelColour] = LAUNCHER_LEVELS[level] ?? LAUNCHER_LEVELS.INFO;
  return `${paint(timestamp, '2')}  ${paint(`${icon} ${level.padEnd(5)}`, levelColour)} ${paint(scope.padEnd(12), '93')} ${paint('│', '2')} ${printable(message)}`;
}

const LAUNCHER_LEVELS = Object.freeze({ INFO: ['●', '32'], WARN: ['▲', '33'], ERROR: ['✖', '31'] });
/** A line already in the Arrakis console style (from the dashboard's own logger) starts with its timestamp. */
const STYLED_LINE = /^(?:\u001b\[[0-9;]*m)?\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}  /u;
const ANSI_SEQUENCE = /\u001b\[[0-9;?]*[A-Za-z]/gu;

/** Control characters become spaces, so relayed text can never forge lines or terminal escapes. */
function printable(message) {
  return Array.from(String(message), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code < 160) ? ' ' : character;
  }).join('');
}

/**
 * The dashboard's output is piped through the relay, so it no longer sees the terminal. In a terminal, hand it the
 * width and keep its colours, exactly as it would have chosen them itself.
 */
export function terminalHints(env = process.env, stdout = process.stdout) {
  if (!stdout.isTTY) return {};
  const hints = {};
  if (!env.COLUMNS && Number.isInteger(stdout.columns)) hints.COLUMNS = String(stdout.columns);
  const mode = env.LOG_COLOR?.trim().toLowerCase() || 'auto';
  if (mode === 'auto' && env.NO_COLOR === undefined && env.TERM !== 'dumb' && env.FORCE_COLOR === undefined) {
    hints.LOG_COLOR = 'always';
  }
  return hints;
}

const launcherLog = (level, message) => {
  const line = formatLogLine('STARTUP', level, message);
  if (level === 'ERROR') console.error(line);
  else if (level === 'WARN') console.warn(line);
  else console.info(line);
};

/**
 * Relay a child's output line by line. Lines from the dashboard's logger pass through unchanged; anything else
 * (Next.js' own banner and notices) is restyled under the NEXT scope so the whole console reads the same.
 */
export function relayOutput(stream, write, level = 'INFO') {
  let pending = '';
  const flush = (line) => {
    if (STYLED_LINE.test(line)) return write(line);
    const text = line.replace(ANSI_SEQUENCE, '').trim();
    if (text) write(formatLogLine('NEXT', /\b(error|failed)\b/iu.test(text) ? 'ERROR' : level, text));
  };
  stream.setEncoding?.('utf8');
  stream.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/u);
    pending = lines.pop() ?? '';
    for (const line of lines) flush(line);
  });
  stream.on('end', () => {
    if (pending) flush(pending);
    pending = '';
  });
}

function pause(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener('abort', finish, { once: true });
  });
}

/** Probe a local page, with bounded requests and cancellation during shutdown. */
export function probeHttp(url, signal) {
  return new Promise((resolve) => {
    const request = get(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]) }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });
    request.once('error', () => resolve(false));
  });
}

export async function announceReadiness(
  url,
  signal,
  { probe = probeHttp, write = (message) => launcherLog('INFO', message) } = {},
) {
  const started = Date.now();
  // Dev note: one roll call is enough once the HTTP listener answers.
  while (!signal.aborted && Date.now() - started < 60000) {
    let ready = false;
    try {
      ready = await probe(url, signal);
    } catch {
      /* Startup and shutdown may close the listener. */
    }
    if (signal.aborted) return;
    if (ready) {
      // The update supervisor and the Pterodactyl egg both wait for this exact phrase (`readyPattern` in package.json).
      write(
        `Arrakis Control Dashboard is listening (ready in ${((Date.now() - started) / 1000).toFixed(1)}s, HTTP check passed).`,
      );
      return;
    }
    await pause(1000, signal);
  }
}

/** Mirror the effective CLI binding, probing loopback when listening on all interfaces. */
export function resolveReadinessUrl(args) {
  let hostname = DEFAULT_HOSTNAME;
  let port = DEFAULT_PORT;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '-H' || arg === '--hostname') hostname = args[++index];
    else if (arg.startsWith('--hostname=')) hostname = arg.slice(11);
    else if (arg.startsWith('-H')) hostname = arg.slice(2).replace(/^=/, '');
    else if (arg === '-p' || arg === '--port') port = args[++index];
    else if (arg.startsWith('--port=')) port = arg.slice(7);
    else if (arg.startsWith('-p')) port = arg.slice(2).replace(/^=/, '');
  }
  if (hostname === '0.0.0.0') hostname = '127.0.0.1';
  if (hostname === '::' || hostname === '[::]') hostname = '::1';
  if (hostname.includes(':') && !hostname.startsWith('[')) hostname = `[${hostname}]`;
  return new URL(`http://${hostname}:${port}/portal`).href;
}

function hasOption(args, shortName, longName) {
  return args.some(
    (arg) =>
      arg === shortName ||
      arg.startsWith(`${shortName}=`) ||
      (arg.startsWith(shortName) && arg.length > shortName.length) ||
      arg === longName ||
      arg.startsWith(`${longName}=`),
  );
}

export function resolveServerOptions(env, forwardedArgs = []) {
  const hostname = (env.SERVER_HOSTNAME || DEFAULT_HOSTNAME).trim();
  const port = (env.SERVER_PORT || DEFAULT_PORT).trim();

  if (!hostname || /[\s\u0000-\u001f\u007f]/u.test(hostname)) {
    throw new Error('Invalid SERVER_HOSTNAME: expected a hostname or IP address without whitespace.');
  }

  if (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65_535) {
    throw new Error('Invalid SERVER_PORT: expected an integer from 1 through 65535.');
  }

  const serverArgs = [];
  if (!hasOption(forwardedArgs, '-H', '--hostname')) serverArgs.push('--hostname', hostname);
  if (!hasOption(forwardedArgs, '-p', '--port')) serverArgs.push('--port', port);

  return serverArgs;
}

/** Fail with an actionable message when `npm start` runs before `npm run build` produced `.next`. */
export async function assertProductionBuild(directory = process.cwd()) {
  try {
    await access(resolve(directory, '.next', 'BUILD_ID'), constants.R_OK);
  } catch {
    // Dev note: you cannot start the spice harvester before it has been assembled.
    throw new Error(
      'No production build found (.next/BUILD_ID is missing). Run "npm run build" in the dashboard folder, ' +
        'or reinstall/rebuild the Pterodactyl server so the installer builds it, then start again.',
    );
  }
}

/** Prepare the Next.js image-optimization cache on the writable server volume. */
export async function prepareImageCache(directory = process.cwd()) {
  const cache = resolve(directory, '.next', 'cache');
  let target = cache;
  try {
    // Dev note: a dangling cache link needs a home before the image spice can flow.
    if ((await lstat(cache)).isSymbolicLink()) target = resolve(dirname(cache), await readlink(cache));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const images = resolve(target, 'images');
  await mkdir(images, { recursive: true });
  await access(images, constants.W_OK);
}

export async function runServer([command, ...forwardedArgs] = process.argv.slice(2)) {
  if (!['dev', 'start'].includes(command)) {
    throw new Error('Server command must be either "dev" or "start".');
  }

  // Bring an existing .env up to date (renamed, removed and new variables) before it is loaded. Names only are logged.
  if (!process.env.VITEST && process.env.ARRAKIS_ENV_MIGRATE !== '0') {
    try {
      const migrated = migrateEnvFile();
      if (migrated.applied) {
        launcherLog(
          'INFO',
          `Updated .env for this release (${migrated.changes.length} change(s)); backup: ${migrated.backup}`,
        );
        for (const change of migrated.changes) launcherLog('INFO', `.env: ${change}`);
        for (const warning of migrated.warnings) launcherLog('WARN', `.env: ${warning}`);
      }
    } catch {
      launcherLog('WARN', 'Could not migrate .env automatically; run npm run env:migrate to see why.');
    }
  }
  // Dev note: load the environment before Next pitches its server tent.
  dotenv.config({ quiet: true });
  const serverArgs = resolveServerOptions(process.env, forwardedArgs);
  if (command === 'start') {
    await assertProductionBuild();
    await prepareImageCache();
  }
  const readinessUrl = resolveReadinessUrl([...serverArgs, ...forwardedArgs]);
  const nextBin = require.resolve('next/dist/bin/next');
  const { superviseChatBridge } = await import('./chat-bridge-supervisor.mjs');
  const bridge = process.env.CHAT_ENABLED === 'true' ? superviseChatBridge() : undefined;
  const child = spawn(process.execPath, [nextBin, command, ...serverArgs, ...forwardedArgs], {
    // Anonymous Next.js telemetry is always off, whatever the environment says.
    env: { ...process.env, ...terminalHints(), NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  relayOutput(child.stdout, (line) => process.stdout.write(`${line}\n`));
  relayOutput(child.stderr, (line) => process.stderr.write(`${line}\n`), 'WARN');

  const controller = new AbortController();
  let shutdownTimer;
  const stop = (signal) => {
    controller.abort();
    child.kill(signal);
    void bridge?.stop(signal);
    shutdownTimer ??= setTimeout(() => child.kill('SIGKILL'), 15_000);
    shutdownTimer.unref();
  };
  const onInterrupt = () => stop('SIGINT');
  const onTerminate = () => stop('SIGTERM');
  process.once('SIGINT', onInterrupt);
  process.once('SIGTERM', onTerminate);
  const readiness = announceReadiness(readinessUrl, controller.signal);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code) => {
        controller.abort();
        process.exitCode = code ?? 1;
        resolve();
      });
    });
  } finally {
    clearTimeout(shutdownTimer);
    controller.abort();
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    await readiness;
    await bridge?.stop();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runServer().catch((error) => {
    launcherLog('ERROR', error instanceof Error ? error.message : 'Unable to start the server.');
    process.exitCode = 1;
  });
}
