import './assert-server';
import { getServerEnv } from '../config/env';

const LEVELS = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
} as const);

type LogLevel = keyof typeof LEVELS;

const COLORS = Object.freeze({
  reset: '\u001B[0m',
  dim: '\u001B[2m',
  cyan: '\u001B[36m',
  green: '\u001B[32m',
  yellow: '\u001B[33m',
  red: '\u001B[31m',
  magenta: '\u001B[35m',
  blue: '\u001B[34m',
  brightCyan: '\u001B[96m',
  brightGreen: '\u001B[92m',
  brightYellow: '\u001B[93m',
  brightMagenta: '\u001B[95m',
  brightBlue: '\u001B[94m',
  brightOrange: '\u001B[38;5;208m',
  white: '\u001B[37m',
});

const CLEAR_TERMINAL = '\u001B[2J\u001B[3J\u001B[H';

const LEVEL_COLORS: Record<LogLevel, string> = Object.freeze({
  DEBUG: COLORS.magenta,
  INFO: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
  FATAL: COLORS.red,
});

const LEVEL_ICONS: Record<LogLevel, string> = Object.freeze({
  DEBUG: '◆',
  INFO: '●',
  WARN: '▲',
  ERROR: '✖',
  FATAL: '✖',
});

const SCOPE_COLORS: Record<string, string> = Object.freeze({
  BOT: COLORS.brightYellow,
  DISCORD: COLORS.brightCyan,
  'SHARD MANAGER': COLORS.brightMagenta,
  'PLAYER PANEL': COLORS.brightGreen,
  'BLUEPRINT PANEL': COLORS.yellow,
  COMMANDS: COLORS.brightBlue,
  COMPONENTS: COLORS.magenta,
  EVENTS: COLORS.green,
  INTERACTIONS: COLORS.cyan,
  'DUNE API': COLORS.yellow,
  'DISCORD ADAPTER': COLORS.brightCyan,
  'DISCORD AUDIT': COLORS.brightGreen,
  'DISCORD AUDIT LOG': COLORS.brightMagenta,
  DASHBOARD: COLORS.brightOrange,
  HTTP: COLORS.brightGreen,
  STARTUP: COLORS.brightYellow,
  REDIS: COLORS.brightMagenta,
  CHAT: COLORS.brightCyan,
  'CHAT BRIDGE': COLORS.brightCyan,
  AUDIT: COLORS.brightBlue,
  default: COLORS.white,
});

export type LogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  [key: string]: unknown;
};

const secretKeyPattern =
  /(password|token|secret|cookie|authorization|session|api[-_]?key|access[-_]?token|private[-_]?key|certificate|^ca$|^cert$|^key$|tls[-_]?(ca|cert|key))/i;

function redact(value: unknown, key = '', seen = new WeakSet<object>(), depth = 0): unknown {
  // Dev note: secrets enter the witness protection program here.
  if (secretKeyPattern.test(key)) {
    return '[REDACTED]';
  }
  if (depth > 5) return '[Truncated]';
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
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
    return value.slice(0, 20).map((item) => redact(item, '', seen, depth + 1));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 40)
        .map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey, seen, depth + 1)]),
    );
  }
  return value;
}

function formatTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function cleanText(value: unknown): string {
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .slice(0, 500);
}

function paint(value: string, color: string): string {
  return process.env.NO_COLOR !== undefined ? value : `${color}${value}${COLORS.reset}`;
}

/** Small, readable detail rows instead of dumping transport-shaped JSON into the console. */
function formatDetails(details: unknown): string[] {
  const fields: string[] = [];
  function visit(value: unknown, path = ''): void {
    if (value === undefined || fields.length >= 40) return;
    if (Array.isArray(value) && value.some((item) => item && typeof item === 'object')) {
      value.forEach((item, index) => visit(item, `${path} / ${index + 1}`));
      return;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) visit(child, path ? `${path} / ${key}` : key);
      return;
    }
    const label = cleanText(
      path
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .toLowerCase(),
    );
    const text = Array.isArray(value) ? value.map((item) => cleanText(item)).join(', ') : cleanText(value ?? '—');
    const color = value === '[REDACTED]' ? COLORS.dim : typeof value === 'number' ? COLORS.brightCyan : COLORS.white;
    fields.push(`${label ? `${paint(label, COLORS.dim)} ${paint('=', COLORS.dim)} ` : ''}${paint(text, color)}`);
  }
  visit(details);
  const rows: string[] = [];
  let row: string[] = [];
  let width = 0;
  for (const field of fields) {
    const length = field.replace(/\u001b\[[0-9;]*m/g, '').length;
    if (row.length && (width + length > 100 || row.length >= 4)) {
      rows.push(row.join(paint('  ·  ', COLORS.dim)));
      row = [];
      width = 0;
    }
    row.push(field);
    width += length + 5;
  }
  if (row.length) rows.push(row.join(paint('  ·  ', COLORS.dim)));
  return rows;
}

export interface Logger {
  header(title: string, subtitle?: string): void;
  debug(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, error?: unknown): void;
  fatal(message: string, error?: unknown): void;
}

/** Shared rendering for application and audit sinks; filtering and output routing belong to the caller. */
export function formatConsoleEntry(
  scope: string,
  level: LogLevel,
  message: string,
  details?: unknown,
  at = new Date(),
): string {
  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;
  const output =
    `${paint(formatTimestamp(at), COLORS.dim)}  ` +
    `${paint(`${LEVEL_ICONS[level]} ${level.padEnd(5)}`, LEVEL_COLORS[level])} ` +
    `${paint(scope.padEnd(12), scopeColor)} ${paint('│', COLORS.dim)} ` +
    cleanText(message);
  const safeDetails = redact(details);
  const rows = formatDetails(safeDetails);
  const inline = rows.length === 1 && rows[0].replace(/\u001b\[[0-9;]*m/g, '').length <= 100;
  return inline
    ? `${output} ${paint('·', COLORS.dim)} ${rows[0]}`
    : rows.length
      ? `${output}\n${rows.map((line) => `    ${paint('↳', COLORS.dim)} ${line}`).join('\n')}`
      : output;
}

export function createLogger(scope: string, minimumLevel: string = getServerEnv().LOG_LEVEL): Logger {
  const normalizedLevel = minimumLevel.toUpperCase() as LogLevel;
  const threshold = LEVELS[normalizedLevel] ?? LEVELS.INFO;

  function write(level: LogLevel, message: string, details?: unknown): void {
    // Dev note: quiet logs are not shy; they simply missed the threshold.
    if (LEVELS[level] < threshold) return;
    const formattedOutput = formatConsoleEntry(scope, level, message, details);

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
      if (process.stdout.isTTY && process.env.NO_COLOR === undefined) process.stdout.write(CLEAR_TERMINAL);
      const width = 64;
      const border = '─'.repeat(width);
      console.log(`\n${paint(`╭${border}╮`, COLORS.brightOrange)}`);
      console.log(
        `${paint('│', COLORS.brightOrange)} ${paint(
          cleanText(title)
            .slice(0, width - 1)
            .padEnd(width - 1),
          COLORS.brightYellow,
        )}${paint('│', COLORS.brightOrange)}`,
      );
      console.log(
        `${paint('│', COLORS.brightOrange)} ${paint(
          cleanText(subtitle)
            .slice(0, width - 1)
            .padEnd(width - 1),
          COLORS.dim,
        )}${paint('│', COLORS.brightOrange)}`,
      );
      console.log(`${paint(`╰${border}╯`, COLORS.brightOrange)}\n`);
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
