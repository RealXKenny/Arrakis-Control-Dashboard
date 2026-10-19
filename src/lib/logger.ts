import './assert-server';
import { COLORS, formatLogLine } from './log-format.mjs';
import { getServerEnv } from '../config/env';

const LEVELS = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
} as const);

type LogLevel = keyof typeof LEVELS;

const CLEAR_TERMINAL = '\u001B[2J\u001B[3J\u001B[H';

export type LogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  [key: string]: unknown;
};

const secretKeyPattern = /(password|token|secret|cookie|authorization|session|api[-_]?key|access[-_]?token)/i;

function redact(value: unknown, key = ''): unknown {
  // Dev note: secrets enter the witness protection program here.
  if (secretKeyPattern.test(key)) {
    return '[REDACTED]';
  }
  if (value instanceof Error) {
    const operationalError = ['DuneConsoleApiError', 'DiscordAdapterApiError'].includes(value.name);
    const production = getServerEnv().NODE_ENV === 'production';
    return {
      name: value.name,
      message: production && !operationalError ? 'Internal error' : value.message,
      stack: production || operationalError ? undefined : value.stack,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]),
    );
  }
  return value;
}

function formatDetails(details: unknown): string {
  if (details === undefined) {
    return '';
  }

  if (typeof details === 'string') {
    return details;
  }

  try {
    return JSON.stringify(details);
  } catch {
    return String(details);
  }
}

export interface Logger {
  header(title: string, subtitle?: string): void;
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, error?: unknown): void;
  fatal(message: string, error?: unknown): void;
}

export function createLogger(scope: string, minimumLevel: string = getServerEnv().LOG_LEVEL): Logger {
  const normalizedLevel = minimumLevel.toUpperCase() as LogLevel;
  const threshold = LEVELS[normalizedLevel] ?? LEVELS.INFO;

  function write(level: LogLevel, message: string, details?: unknown): void {
    // Dev note: quiet logs are not shy; they simply missed the threshold.
    if (LEVELS[level] < threshold) {
      return;
    }

    const output = formatLogLine(scope, level, message);
    const safeDetails = redact(details);
    const line = formatDetails(safeDetails);
    const formattedOutput = line ? `${output} ${COLORS.dim}·${COLORS.reset} ${line}` : output;

    if (level === 'ERROR' || level === 'FATAL') {
      // Dev note: errors use stderr because regular output asked for boundaries.
      console.error(formattedOutput);

      return;
    }

    if (level === 'WARN') {
      console.warn(formattedOutput);
      return;
    }

    if (level === 'DEBUG') {
      console.debug(formattedOutput);
      return;
    }

    console.info(formattedOutput);
  }

  return Object.freeze({
    header(title: string, subtitle = 'Dune: Awakening Dashboard'): void {
      if (LEVELS.INFO < threshold) {
        return;
      }

      // Dev note: even Pterodactyl gets a clean runway before this banner lands.
      process.stdout.write(CLEAR_TERMINAL);
      const width = 64;
      const border = '─'.repeat(width);
      console.log(`\n${COLORS.brightOrange}╭${border}╮${COLORS.reset}`);
      console.log(
        `${COLORS.brightOrange}│${COLORS.reset} ${COLORS.brightYellow}${title.padEnd(width - 1)}${COLORS.reset}${COLORS.brightOrange}│${COLORS.reset}`,
      );
      console.log(
        `${COLORS.brightOrange}│${COLORS.reset} ${COLORS.dim}${subtitle.padEnd(width - 1)}${COLORS.reset}${COLORS.brightOrange}│${COLORS.reset}`,
      );
      console.log(`${COLORS.brightOrange}╰${border}╯${COLORS.reset}\n`);
    },
    debug: (message: string, details?: unknown) => write('DEBUG', message, details),
    info: (message: string, details?: unknown) => write('INFO', message, details),
    warn: (message: string, details?: unknown) => write('WARN', message, details),
    error: (message: string, error?: unknown) => write('ERROR', message, error),
    fatal: (message: string, error?: unknown) => write('FATAL', message, error),
  });
}

export const logger = createLogger('DASHBOARD');

const ACCESS_LOG_WINDOW_MS = 5 * 60_000;
const ACCESS_LOG_LIMIT = 128;
const BACKGROUND_POLL_ROUTES = new Set([
  '/api/map',
  '/api/market',
  '/api/market/listings',
  '/api/player',
  '/api/portal/world',
  '/api/server/status',
  '/api/session',
]);
const accessLogState = new Map<string, { lastLoggedAt: number; suppressed: number }>();
const accessLogger = createLogger('HTTP');

export function logRequestAccess(
  request: { route: string; method: string; status: number; durationMs: number },
  now = Date.now(),
): void {
  const key = `${request.method} ${request.route} ${request.status}`;
  const previous = accessLogState.get(key);

  if (previous && now - previous.lastLoggedAt < ACCESS_LOG_WINDOW_MS) {
    previous.suppressed += 1;
    return;
  }

  if (!previous && accessLogState.size >= ACCESS_LOG_LIMIT) {
    accessLogState.delete(accessLogState.keys().next().value!);
  }

  const repeatSummary = previous?.suppressed
    ? ` · ${previous.suppressed} repeat${previous.suppressed === 1 ? '' : 's'} suppressed`
    : '';
  accessLogState.set(key, { lastLoggedAt: now, suppressed: 0 });
  const message =
    `${request.method} ${request.route} → ${request.status} ` +
    `(${Math.max(0, Math.round(request.durationMs))}ms)${repeatSummary}`;

  // Dev note: polling can stay in the sietch until DEBUG calls the meeting.
  if (request.method === 'GET' && BACKGROUND_POLL_ROUTES.has(request.route)) {
    accessLogger.debug(message);
    return;
  }

  accessLogger.info(message);
}

export function createRequestLogger(context: LogContext): Logger {
  const requestLogger = createLogger('DASHBOARD');
  const mergeDetails = (details: unknown): LogContext =>
    details && typeof details === 'object' && !Array.isArray(details)
      ? { ...context, ...(details as LogContext) }
      : { ...context, details };

  return {
    header: requestLogger.header,
    debug: (message, details) => requestLogger.debug(message, mergeDetails(details)),
    info: (message, details) => requestLogger.info(message, mergeDetails(details)),
    warn: (message, details) => requestLogger.warn(message, mergeDetails(details)),
    error: (message, error) => requestLogger.error(message, { ...context, error }),
    fatal: (message, error) => requestLogger.fatal(message, { ...context, error }),
  };
}
