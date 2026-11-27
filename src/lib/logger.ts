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

/**
 * Arrakis console style, shared with the bot (src/client/logger.ts there). Keep the scope colours, layout, colour
 * policy and banner identical in both repositories so the two consoles read as one product.
 */
const SCOPE_COLORS: Record<string, string> = Object.freeze({
  // Products and startup
  BOT: COLORS.brightYellow,
  DASHBOARD: COLORS.brightOrange,
  STARTUP: COLORS.brightYellow,
  SYSTEM: COLORS.brightYellow,
  UPDATES: COLORS.brightYellow,
  RELEASES: COLORS.brightOrange,
  'VERSION ANNOUNCEMENTS': COLORS.brightOrange,
  CONFIG: COLORS.brightBlue,
  METRICS: COLORS.cyan,
  WORKERS: COLORS.cyan,
  // Discord
  DISCORD: COLORS.brightCyan,
  GATEWAY: COLORS.brightCyan,
  'SHARD MANAGER': COLORS.brightMagenta,
  SAPPHIRE: COLORS.magenta,
  COMMANDS: COLORS.brightBlue,
  COMPONENTS: COLORS.magenta,
  EVENTS: COLORS.green,
  INTERACTIONS: COLORS.cyan,
  'DISCORD ADAPTER': COLORS.brightCyan,
  'DISCORD AUDIT': COLORS.brightGreen,
  'DISCORD AUDIT LOG': COLORS.brightMagenta,
  // Game data
  'DUNE API': COLORS.yellow,
  'CONVOY API': COLORS.brightBlue,
  PLAYERS: COLORS.brightGreen,
  'PLAYER PANEL': COLORS.brightGreen,
  'BLUEPRINT PANEL': COLORS.yellow,
  MARKET: COLORS.brightOrange,
  SERVER: COLORS.yellow,
  'CORIOLIS STORM': COLORS.brightOrange,
  'SEASON CLAIMS': COLORS.brightOrange,
  // Storage and transport
  STORAGE: COLORS.brightGreen,
  REDIS: COLORS.brightMagenta,
  CACHE: COLORS.brightMagenta,
  HTTP: COLORS.brightGreen,
  GITHUB: COLORS.white,
  BACKUPS: COLORS.brightBlue,
  'MESSAGE ARCHIVE': COLORS.yellow,
  // Community
  COMMUNITY: COLORS.brightGreen,
  CHAT: COLORS.brightCyan,
  'CHAT BRIDGE': COLORS.brightCyan,
  MUSIC: COLORS.brightMagenta,
  LAVALINK: COLORS.magenta,
  VOICE: COLORS.brightCyan,
  LEVELING: COLORS.brightGreen,
  SUGGESTIONS: COLORS.brightMagenta,
  TICKETS: COLORS.green,
  'TICKET PANEL': COLORS.brightGreen,
  'TICKET ARCHIVE': COLORS.yellow,
  // Safety
  AUDIT: COLORS.brightBlue,
  SECURITY: COLORS.red,
  MODERATION: COLORS.red,
  HONEYPOT: COLORS.red,
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
  // Stacks are printed separately at DEBUG, so one failure never turns into a wall of text.
  if (value instanceof Error) return describeError(value);

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

const OPERATIONAL_ERROR_NAMES = ['DuneConsoleApiError', 'DiscordAdapterApiError', 'DiscordAPIError', 'HTTPError'];

/** Errors whose messages come from a remote API and are safe and useful to show in production. */
function isOperationalError(error: Error): boolean {
  return OPERATIONAL_ERROR_NAMES.some((name) => error.name === name || error.name.startsWith(`${name}[`));
}

/** One readable line for an error: `Name: message`, plus its code when the name does not already carry it. */
export function describeError(error: Error): string {
  const production = getServerEnv().NODE_ENV === 'production';
  const message = production && !isOperationalError(error) ? 'Internal error' : error.message;
  const rawCode = (error as Error & { code?: unknown }).code;
  const code =
    (typeof rawCode === 'string' || typeof rawCode === 'number') && !error.name.includes(String(rawCode))
      ? String(rawCode)
      : undefined;
  return `${error.name}: ${message}${code ? ` (code ${code})` : ''}`;
}

/** Stack frames shown at DEBUG, without the first line because the log line already names the error. */
function stackLines(error: Error): string[] {
  if (getServerEnv().NODE_ENV === 'production' && !isOperationalError(error)) return [];
  return (error.stack ?? '')
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);
}

function findError(details: unknown): Error | undefined {
  if (details instanceof Error) return details;
  if (details && typeof details === 'object' && !Array.isArray(details)) {
    const nested = (details as { error?: unknown }).error;
    if (nested instanceof Error) return nested;
  }
  return undefined;
}

const ANSI_ESCAPE = String.fromCharCode(27);
const ANSI_COLOR_PATTERN = new RegExp(`${ANSI_ESCAPE}\\[[0-9;]*m`, 'g');
const DEFAULT_PRODUCTION_COLUMNS = 120;

/** Short console names for scopes wider than the 12-character column. Colours stay keyed by the full scope. */
const SCOPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  'SHARD MANAGER': 'SHARDS',
  'VERSION ANNOUNCEMENTS': 'RELEASE NEWS',
  'DISCORD ADAPTER': 'DISCORD API',
  'DISCORD AUDIT': 'AUDIT',
  'DISCORD AUDIT LOG': 'AUDIT LOG',
  'BLUEPRINT PANEL': 'BLUEPRINTS',
  'CORIOLIS STORM': 'CORIOLIS',
  'SEASON CLAIMS': 'CLAIMS',
  'MESSAGE ARCHIVE': 'ARCHIVE',
  'TICKET ARCHIVE': 'TRANSCRIPTS',
});
const SCOPE_WIDTH = 12;
/** Visible width of `date time  ● LEVEL SCOPE        │ `, where every message line starts. */
const MESSAGE_COLUMN = 19 + 2 + 7 + 1 + SCOPE_WIDTH + 1 + 2;
const MAX_WRAPPED_LINES = 6;

/** The scope as printed: a short label for long scopes, never wider than the column. */
export function scopeLabel(scope: string): string {
  return (SCOPE_LABELS[scope] ?? scope).slice(0, SCOPE_WIDTH);
}

/**
 * Splits a long message into lines that fit beside the prefix, breaking after `|`, `·`, `,` or a space, so a narrow
 * console shows the whole line under its own scope instead of wrapping into the next column.
 */
export function wrapMessage(message: string, room: number): string[] {
  if (!Number.isFinite(room) || room < 20 || message.length <= room) return [message];
  const lines: string[] = [];
  let rest = message;
  while (rest.length > room && lines.length < MAX_WRAPPED_LINES - 1) {
    const window = rest.slice(0, room + 1);
    const breakAt = Math.max(window.lastIndexOf(' | '), window.lastIndexOf(' · '));
    const cut = breakAt > room / 3 ? breakAt : Math.max(window.lastIndexOf(', ') + 1, window.lastIndexOf(' '));
    const end = cut > room / 3 ? cut : room;
    lines.push(rest.slice(0, end).trimEnd());
    rest = rest.slice(end).replace(/^\s*[|·]?\s*/u, '');
  }
  lines.push(rest.length > room ? `${rest.slice(0, room - 1)}…` : rest);
  return lines;
}

function visibleLength(value: string): number {
  return Array.from(value.replace(ANSI_COLOR_PATTERN, '')).length;
}

/** Cut a line to the terminal width with an ellipsis, keeping colour codes intact, so the console never wraps. */
export function fitConsoleLine(value: string, columns: number | undefined): string {
  if (!columns || !Number.isInteger(columns) || columns < 2) return value;
  // Leave the final cell unused: several PTYs wrap before processing the newline when every column is occupied.
  const limit = columns - 1;
  if (visibleLength(value) <= limit) return value;
  const contentLimit = Math.max(0, limit - 1);
  let output = '';
  let visible = 0;
  for (let index = 0; index < value.length && visible < contentLimit;) {
    if (value[index] === ANSI_ESCAPE) {
      const end = value.indexOf('m', index + 2);
      if (value.startsWith(`${ANSI_ESCAPE}[`, index) && end !== -1 && /^[0-9;]*$/.test(value.slice(index + 2, end))) {
        output += value.slice(index, end + 1);
        index = end + 1;
        continue;
      }
    }
    const codePoint = value.codePointAt(index)!;
    output += String.fromCodePoint(codePoint);
    index += codePoint > 0xffff ? 2 : 1;
    visible += 1;
  }
  return `${output}${value.includes(ANSI_ESCAPE) ? COLORS.reset : ''}…`;
}

function terminalColumns(level: LogLevel): number | undefined {
  const primary = ['ERROR', 'FATAL', 'WARN'].includes(level) ? process.stderr.columns : process.stdout.columns;
  const fallback = process.stdout.columns ?? process.stderr.columns;
  const environment = Number(process.env.COLUMNS);
  return (
    [primary, fallback, environment].find((value) => Number.isInteger(value) && Number(value) > 1) ??
    (getServerEnv().NODE_ENV === 'production' || process.env.P_SERVER_UUID?.trim()
      ? DEFAULT_PRODUCTION_COLUMNS
      : undefined)
  );
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

/**
 * Colour policy. `LOG_COLOR=always|never` wins, then the NO_COLOR and FORCE_COLOR conventions. In `auto` mode colour is
 * on for a terminal and inside a Pterodactyl container, whose web console renders ANSI although the update supervisor
 * pipes our output.
 */
export function shouldUseColor(
  env: Readonly<Record<string, string | undefined>> = process.env,
  isTTY = Boolean(process.stdout.isTTY),
): boolean {
  const mode = env.LOG_COLOR?.trim().toLowerCase() || 'auto';
  if (mode === 'always' || mode === 'true') return true;
  if (mode === 'never' || mode === 'false') return false;
  if (env.NO_COLOR !== undefined || env.TERM === 'dumb') return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0';
  return isTTY || Boolean(env.P_SERVER_UUID?.trim());
}

function paint(value: string, color: string): string {
  return shouldUseColor() ? `${color}${value}${COLORS.reset}` : value;
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
    const length = visibleLength(field);
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

/** Clear before the banner in a terminal or a Pterodactyl container, never for redirected output or NO_COLOR. */
export function shouldClearConsole(
  env: Readonly<Record<string, string | undefined>> = process.env,
  isTTY = Boolean(process.stdout.isTTY),
): boolean {
  if (env.NO_COLOR !== undefined || ['never', 'false'].includes(env.LOG_COLOR?.trim().toLowerCase() ?? ''))
    return false;
  return isTTY || Boolean(env.P_SERVER_UUID?.trim());
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
  columns?: number,
): string {
  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;
  const room = columns && Number.isInteger(columns) ? columns - 1 - MESSAGE_COLUMN : Infinity;
  const [first = '', ...rest] = wrapMessage(cleanText(message), room);
  const output = [
    `${paint(formatTimestamp(at), COLORS.dim)}  ` +
      `${paint(`${LEVEL_ICONS[level]} ${level.padEnd(5)}`, LEVEL_COLORS[level])} ` +
      `${paint(scopeLabel(scope).padEnd(SCOPE_WIDTH), scopeColor)} ${paint('│', COLORS.dim)} ` +
      first,
    ...rest.map((chunk) => `${' '.repeat(MESSAGE_COLUMN - 2)}${paint('│', COLORS.dim)} ${chunk}`),
  ].join('\n');
  const safeDetails = redact(details);
  const rows = formatDetails(safeDetails);
  const last = rest.at(-1) ?? first;
  const inline = rows.length === 1 && visibleLength(rows[0]) <= Math.min(100, room - last.length - 3);
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
    const columns = terminalColumns(level);
    const formattedOutput = formatConsoleEntry(scope, level, message, details, new Date(), columns)
      .split('\n')
      .map((line) => fitConsoleLine(line, columns))
      .join('\n');

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

  function writeStack(details: unknown): void {
    if (LEVELS.DEBUG < threshold) return;
    const error = findError(details);
    if (!error) return;
    const columns = terminalColumns('DEBUG');
    // Dev note: the stack trace waits in the DEBUG lounge until someone actually asks for directions.
    for (const frame of stackLines(error)) console.debug(fitConsoleLine(paint(`    ${frame}`, COLORS.dim), columns));
  }

  return Object.freeze({
    header(title: string, subtitle = 'Dune: Awakening Dashboard'): void {
      if (LEVELS.INFO < threshold) {
        return;
      }

      // Dev note: even Pterodactyl gets a clean runway before this banner lands. Its web console renders ANSI
      // although the update supervisor pipes our output, so a Pterodactyl container counts as a terminal here.
      if (shouldClearConsole()) process.stdout.write(CLEAR_TERMINAL);
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
    warn: (message: string, details?: unknown) => {
      write('WARN', message, details);
      writeStack(details);
    },
    error: (message: string, error?: unknown) => {
      write('ERROR', message, error);
      writeStack(error);
    },
    fatal: (message: string, error?: unknown) => {
      write('FATAL', message, error);
      writeStack(error);
    },
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
