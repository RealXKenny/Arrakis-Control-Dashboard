import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { get } from 'node:http';
import dotenv from 'dotenv';

const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_PORT = '2008';
const require = createRequire(import.meta.url);

// Kept in this standalone launcher so the production image needs no TypeScript log imports.
function formatLogLine(scope, level, message) {
  const timestamp = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  return `\u001b[2m[${timestamp}]\u001b[0m \u001b[32m● [${level}]\u001b[0m \u001b[93m[${scope}]\u001b[0m ${message}`;
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
      write('Ready in — Arrakis Control Dashboard is listening (HTTP check passed).');
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

export async function runServer([command, ...forwardedArgs] = process.argv.slice(2)) {
  if (!['dev', 'start'].includes(command)) {
    throw new Error('Server command must be either "dev" or "start".');
  }

  // Dev note: load the environment before Next pitches its server tent.
  dotenv.config({ quiet: true });
  const serverArgs = resolveServerOptions(process.env, forwardedArgs);
  const readinessUrl = resolveReadinessUrl([...serverArgs, ...forwardedArgs]);
  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, command, ...serverArgs, ...forwardedArgs], {
    env: process.env,
    stdio: 'inherit',
  });

  const controller = new AbortController();
  const stop = (signal) => {
    controller.abort();
    child.kill(signal);
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
    controller.abort();
    process.removeListener('SIGINT', onInterrupt);
    process.removeListener('SIGTERM', onTerminate);
    await readiness;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runServer().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to start the server.');
    process.exitCode = 1;
  });
}
