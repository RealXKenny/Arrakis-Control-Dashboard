import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import dotenv from 'dotenv';

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

  await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  runServer().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to start the server.');
    process.exitCode = 1;
  });
}
