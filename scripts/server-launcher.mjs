import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { get } from 'node:http';
import { access, lstat, mkdir, readlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';

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
  const paint = (text, color) => (process.env.NO_COLOR !== undefined ? text : `\u001b[${color}m${text}\u001b[0m`);
  return `${paint(timestamp, '2')}  ${paint(`● ${level.padEnd(5)}`, '32')} ${paint(scope.padEnd(12), '93')} ${paint('│', '2')} ${message}`;
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
  { probe = probeHttp, write = (message) => console.info(formatLogLine('STARTUP', 'INFO', message)) } = {},
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
      write(`Dashboard ready in ${((Date.now() - started) / 1000).toFixed(1)}s (HTTP check passed).`);
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

  // Dev note: load the environment before Next pitches its server tent.
  dotenv.config({ quiet: true });
  const serverArgs = resolveServerOptions(process.env, forwardedArgs);
  if (command === 'start') await prepareImageCache();
  const readinessUrl = resolveReadinessUrl([...serverArgs, ...forwardedArgs]);
  const nextBin = require.resolve('next/dist/bin/next');
  const { superviseChatBridge } = await import('./chat-bridge-supervisor.mjs');
  const bridge = process.env.CHAT_ENABLED === 'true' ? superviseChatBridge() : undefined;
  const child = spawn(process.execPath, [nextBin, command, ...serverArgs, ...forwardedArgs], {
    // Anonymous Next.js telemetry is always off, whatever the environment says.
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  });

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
    console.error(error instanceof Error ? error.message : 'Unable to start the server.');
    process.exitCode = 1;
  });
}
