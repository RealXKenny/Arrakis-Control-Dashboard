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
import { clearInterval, clearTimeout, setInterval, setTimeout } from 'node:timers';
import { URL } from 'node:url';
import {
  UpdateError,
  checkAndUpdate,
  confirmHealthy,
  insideWindow,
  installStatus,
  readProductConfig,
  readReleaseSignal,
  recover,
  rollbackUnhealthy,
  signalWantsUpdate,
  updaterSettings,
  waitForHealth,
} from './updater.mjs';

const root = process.cwd();
const timestampFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});
const TROUBLE = /\b(fail|failed|could not|did not|unavailable|conflict|restoring|rollback|exited|off until)\b/i;

/** Colour policy shared with both applications' loggers: LOG_COLOR, NO_COLOR, FORCE_COLOR, terminal or Pterodactyl. */
function colourEnabled(env = process.env) {
  const mode = env.LOG_COLOR?.trim().toLowerCase() || 'auto';
  if (mode === 'always' || mode === 'true') return true;
  if (mode === 'never' || mode === 'false') return false;
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0';
  return Boolean(process.stdout.isTTY || env.P_SERVER_UUID?.trim());
}

/** Control characters become spaces, so a message can never forge lines or terminal escapes. */
function printable(message) {
  return Array.from(String(message), (character) => {
    const code = character.charCodeAt(0);
    return code < 32 || (code >= 127 && code < 160) ? ' ' : character;
  }).join('');
}

/** One line in the Arrakis console style: `date time  ● LEVEL UPDATES      │ message`. */
function formatLine(message, at = new Date()) {
  const values = Object.fromEntries(timestampFormat.formatToParts(at).map(({ type, value }) => [type, value]));
  const timestamp = `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
  const warn = TROUBLE.test(message);
  const colour = colourEnabled();
  const paint = (text, code) => (colour ? `\u001b[${code}m${text}\u001b[0m` : text);
  const level = warn ? '▲ WARN ' : '● INFO ';
  return `${paint(timestamp, '2')}  ${paint(level, warn ? '33' : '32')} ${paint('UPDATES'.padEnd(12), '93')} ${paint('│', '2')} ${printable(message)}`;
}

const log = (message) => globalThis.console.info(formatLine(message));
const STOP_GRACE_MS = 30_000;
const WINDOW_RETRY_MS = 15 * 60_000;

let child = null;
let childExit = null;
let shuttingDown = false;
let updating = false;
let timer = null;
let signalTimer = null;
const SIGNAL_ERROR_REPEAT_MS = 3_600_000;

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
  const outcome = await waitForHealth({ ready, exited, healthMs: settings.healthMs });
  if (outcome === 'healthy' && child.exitCode === null) {
    await confirmHealthy(root, log);
    return true;
  }
  if (shuttingDown) return true;
  if (outcome === 'unready') log('The new version did not print its ready line in time; rolling it back.');
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

/** Where to hear about new releases: AUTO_UPDATE_SIGNAL_URL, or this application's own endpoint when it has one. */
function signalUrlFor(config, settings) {
  if (settings.signalUrl) return settings.signalUrl;
  const port = String(process.env.SERVER_PORT ?? '').trim();
  if (!config.signalPath || !/^\d{1,5}$/.test(port) || !String(config.signalPath).startsWith('/')) return null;
  return `http://127.0.0.1:${port}${config.signalPath}`;
}

/**
 * Check the release signal every few seconds and start an update check as soon as a newer release is announced,
 * instead of waiting for the next scheduled check. The scheduled check stays as the fallback, and the maintenance
 * window, verification and health checks apply exactly as they do to it.
 */
function watchReleaseSignal(config, settings) {
  const url = signalUrlFor(config, settings);
  if (!url) return;
  log(`Listening for new releases at ${new URL(url).origin}.`);
  let announced = null;
  let lastError = { text: '', at: 0 };
  const tick = async () => {
    if (shuttingDown || updating) return;
    try {
      const signal = await readReleaseSignal({ url, repository: config.repository });
      lastError = { text: '', at: 0 };
      if (!signal || signal.version === announced) return;
      const status = await installStatus(root);
      if (!signalWantsUpdate(signal.version, { ...status, channel: settings.channel, pin: settings.pin })) return;
      announced = signal.version;
      log(`Release ${signal.version} was just published; checking for it now.`);
      clearTimeout(timer);
      await periodicCheck(config, settings);
    } catch (error) {
      // A dashboard that is restarting or unreachable is normal; say so once an hour at most.
      const text = describe(error);
      if (text !== lastError.text || Date.now() - lastError.at > SIGNAL_ERROR_REPEAT_MS) {
        log(`Release signal unavailable (${text}); scheduled checks continue.`);
        lastError = { text, at: Date.now() };
      }
    }
  };
  signalTimer = setInterval(() => void tick(), settings.signalMs);
  signalTimer.unref?.();
}

function forwardSignals() {
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      shuttingDown = true;
      clearTimeout(timer);
      clearInterval(signalTimer);
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
        watchReleaseSignal(config, settings);
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
  if (settings.enabled) {
    scheduleCheck(config, settings, jittered(settings.intervalMs));
    watchReleaseSignal(config, settings);
  }
}

main().catch((error) => {
  log(`Supervisor failed: ${describe(error)}`);
  process.exit(1);
});
