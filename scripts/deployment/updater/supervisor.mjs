#!/usr/bin/env node
/**
 * Arrakis Control process supervisor with optional automatic updates (shared by the dashboard and the bot; keep both
 * copies identical). It runs the application as one child process, forwards Pterodactyl's stop signal, and exits with
 * the child's exit code so Wings' own crash detection keeps working. It never restarts a crashing application in a
 * loop: the only restart it performs is the one an update needs, plus at most one rollback to the previous version.
 *
 * Usage (from the install directory): node <path>/supervisor.mjs
 */
import { spawn } from 'node:child_process';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import {
  UpdateError,
  checkAndUpdate,
  confirmHealthy,
  insideWindow,
  readProductConfig,
  recover,
  rollbackUnhealthy,
  updaterSettings,
} from './updater.mjs';

const root = process.cwd();
const log = (message) => globalThis.console.info(`[updater] ${message}`);
const STOP_GRACE_MS = 30_000;
const WINDOW_RETRY_MS = 15 * 60_000;

let child = null;
let childExit = null;
let shuttingDown = false;
let updating = false;
let timer = null;

function describe(error) {
  const text = error instanceof UpdateError ? error.message : `${error?.name ?? 'Error'}: ${error?.message ?? error}`;
  return text.replace(/\.+$/, '');
}

/** Start the application and resolve `ready` once its ready line appears. */
function startChild(config) {
  const pattern = config.readyPattern ? new RegExp(config.readyPattern) : null;
  let markReady;
  const ready = new Promise((resolve) => (markReady = resolve));
  if (!pattern) markReady();
  const process_ = spawn(config.start[0], config.start.slice(1), {
    cwd: root,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  let tail = '';
  const forward = (stream, target) =>
    stream.on('data', (chunk) => {
      target.write(chunk);
      if (!pattern) return;
      tail = (tail + chunk.toString()).slice(-4_096);
      if (pattern.test(tail)) markReady();
    });
  forward(process_.stdout, process.stdout);
  forward(process_.stderr, process.stderr);
  const exited = new Promise((resolve) =>
    process_.on('exit', (code, signal) => resolve({ code: code ?? (signal ? 1 : 0), signal })),
  );
  process_.on('error', (error) => log(`Could not start the application: ${error.message}`));
  child = process_;
  childExit = exited;
  return { ready, exited };
}

/** Ask the application to stop the way Pterodactyl would, then escalate only if it ignores the request. */
async function stopChild() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = childExit;
  child.kill('SIGINT');
  const timeout = (ms) => new Promise((resolve) => setTimeout(() => resolve('timeout'), ms).unref());
  if ((await Promise.race([exited, timeout(STOP_GRACE_MS)])) === 'timeout') {
    log('The application did not stop in time; sending SIGTERM.');
    child.kill('SIGTERM');
    if ((await Promise.race([exited, timeout(10_000)])) === 'timeout') child.kill('SIGKILL');
  }
  await exited;
}

/**
 * Run the application after an activation and decide whether the new version is healthy. Healthy means the ready
 * line appeared and the process was still running when the health period ended.
 */
async function superviseNewVersion(config, settings) {
  const { ready, exited } = startChild(config);
  const deadline = new Promise((resolve) => setTimeout(() => resolve('deadline'), settings.healthMs).unref());
  const outcome = await Promise.race([
    exited.then(() => 'exited'),
    Promise.all([ready, deadline]).then(() => 'healthy'),
  ]);
  if (outcome === 'healthy' && child.exitCode === null) {
    await confirmHealthy(root, log);
    return true;
  }
  if (shuttingDown) return true;
  await stopChild();
  await rollbackUnhealthy(root, log);
  log('Starting the previous version again.');
  startChild(config);
  return false;
}

function watchChild() {
  const current = child;
  childExit.then(({ code, signal }) => {
    if (current !== child || updating) return;
    clearTimeout(timer);
    if (!shuttingDown) log(`The application exited (${signal ?? `code ${code}`}).`);
    process.exit(code);
  });
}

function scheduleCheck(config, settings, delay) {
  clearTimeout(timer);
  timer = setTimeout(() => void periodicCheck(config, settings), delay);
  timer.unref?.();
}

function jittered(ms) {
  return Math.round(ms * (0.9 + Math.random() * 0.2));
}

async function periodicCheck(config, settings) {
  if (shuttingDown) return;
  if (!insideWindow(settings.window)) {
    scheduleCheck(config, settings, WINDOW_RETRY_MS);
    return;
  }
  updating = true;
  let stopped = false;
  try {
    const result = await checkAndUpdate({
      root,
      config,
      settings,
      log,
      beforeActivate: async (version) => {
        if (shuttingDown) throw new UpdateError('The server is stopping; the update will be retried later.');
        log(`Stopping the application to install ${version}.`);
        stopped = true;
        await stopChild();
      },
    });
    if (result.status === 'activated') {
      log(`Installed ${result.version}; starting it.`);
      await superviseNewVersion(config, settings);
    } else if (result.status === 'current') {
      log(`Up to date (${result.version}).`);
    }
  } catch (error) {
    log(`Update check failed: ${describe(error)}. The current version keeps running.`);
    if (stopped && !shuttingDown) {
      log('Starting the current version again.');
      startChild(config);
    }
  } finally {
    updating = false;
  }
  if (shuttingDown) return;
  watchChild();
  scheduleCheck(config, settings, jittered(settings.intervalMs));
}

function forwardSignals() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      shuttingDown = true;
      clearTimeout(timer);
      if (!child || child.exitCode !== null) process.exit(0);
      child.kill(signal === 'SIGHUP' ? 'SIGTERM' : signal);
      childExit.then(({ code }) => process.exit(code));
    });
  }
}

async function main() {
  forwardSignals();
  const config = await readProductConfig(root);
  let settings;
  try {
    settings = updaterSettings(process.env);
  } catch (error) {
    // A malformed updater setting never keeps the application down; updates simply stay off until it is fixed.
    log(`${describe(error)}. Automatic updates are off until this is corrected.`);
    settings = { ...updaterSettings({ AUTO_UPDATE_ENABLED: 'false' }) };
  }

  try {
    await recover(root, log);
  } catch (error) {
    log(`Could not finish restoring the previous version: ${describe(error)}`);
    process.exit(1);
  }

  if (settings.enabled && settings.onStartup) {
    try {
      const result = await checkAndUpdate({ root, config, settings, log });
      if (result.status === 'activated') {
        log(`Installed ${result.version}; starting it.`);
        await superviseNewVersion(config, settings);
        watchChild();
        scheduleCheck(config, settings, jittered(settings.intervalMs));
        return;
      }
      if (result.status === 'current') log(`Up to date (${result.version}).`);
    } catch (error) {
      log(`Startup update check failed: ${describe(error)}. Starting the installed version.`);
    }
  } else if (!settings.enabled && process.env.AUTO_UPDATE_ENABLED !== undefined) {
    log('Automatic updates are disabled (AUTO_UPDATE_ENABLED=false).');
  }

  startChild(config);
  watchChild();
  if (settings.enabled) scheduleCheck(config, settings, jittered(settings.intervalMs));
}

main().catch((error) => {
  log(`Supervisor failed: ${describe(error)}`);
  process.exit(1);
});
