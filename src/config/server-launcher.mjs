import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { formatLogLine } from '../lib/log-format.mjs';

const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_PORT = '2008';
const require = createRequire(import.meta.url);

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

export function readinessUrl(args) {
  const option = (short, long) => {
    let value;
    for (let i = 0; i < args.length; i++) {
      if (args[i] === short || args[i] === long) value = args[++i];
      else if (args[i].startsWith(`${long}=`)) value = args[i].slice(long.length + 1);
      else if (args[i].startsWith(short)) value = args[i].slice(short.length).replace(/^=/, '');
    }
    return value;
  };
  let hostname = option('-H', '--hostname') || DEFAULT_HOSTNAME;
  if (hostname === '0.0.0.0') hostname = '127.0.0.1';
  if (hostname === '::' || hostname === '[::]') hostname = '::1';
  if (hostname.includes(':') && !hostname.startsWith('[')) hostname = `[${hostname}]`;
  return `http://${hostname}:${option('-p', '--port') || DEFAULT_PORT}/favicon.ico`;
}

function pause(ms, signal) {
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
  });
}

async function probeHttp(url, signal) {
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
  });
  await response.body?.cancel();
  return response.status === 200;
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

export async function runServer([command, ...forwardedArgs] = process.argv.slice(2)) {
  if (!['dev', 'start'].includes(command)) {
    throw new Error('Server command must be either "dev" or "start".');
  }

  // Dev note: load the environment before Next pitches its server tent.
  dotenv.config({ quiet: true });
  const serverArgs = resolveServerOptions(process.env, forwardedArgs);
  const nextBin = require.resolve('next/dist/bin/next');
  const child = spawn(process.execPath, [nextBin, command, ...serverArgs, ...forwardedArgs], {
    env: process.env,
    stdio: 'inherit',
  });
  const readiness = new AbortController();
  const forwardSignal = (signal) => {
    readiness.abort();
    child.kill(signal);
  };
  const terminate = () => forwardSignal('SIGTERM');
  const interrupt = () => forwardSignal('SIGINT');
  process.once('SIGTERM', terminate);
  process.once('SIGINT', interrupt);
  if (command === 'start') void announceReadiness(readinessUrl([...serverArgs, ...forwardedArgs]), readiness.signal);
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    readiness.abort();
    process.removeListener('SIGTERM', terminate);
    process.removeListener('SIGINT', interrupt);
  }
  if (result.signal) process.kill(process.pid, result.signal);
  else process.exitCode = result.code ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runServer().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to start the server.');
    process.exitCode = 1;
  });
}
