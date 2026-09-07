import * as Sentry from "@sentry/nextjs";

const LEVELS = Object.freeze({
  DEBUG: 10,
  INFO: 20,
  WARN: 30,
  ERROR: 40,
  FATAL: 50,
} as const);

type LogLevel = keyof typeof LEVELS;

const COLORS = Object.freeze({
  reset: "\u001B[0m",
  dim: "\u001B[2m",
  cyan: "\u001B[36m",
  green: "\u001B[32m",
  yellow: "\u001B[33m",
  red: "\u001B[31m",
  magenta: "\u001B[35m",
  blue: "\u001B[34m",
  brightCyan: "\u001B[96m",
  brightGreen: "\u001B[92m",
  brightYellow: "\u001B[93m",
  brightMagenta: "\u001B[95m",
  brightBlue: "\u001B[94m",
  brightOrange: "\u001B[38;5;208m",
  white: "\u001B[37m",
});

const LEVEL_COLORS: Record<LogLevel, string> = Object.freeze({
  DEBUG: COLORS.magenta,
  INFO: COLORS.green,
  WARN: COLORS.yellow,
  ERROR: COLORS.red,
  FATAL: COLORS.red,
});

const SCOPE_COLORS: Record<string, string> = Object.freeze({
  BOT: COLORS.brightYellow,
  DISCORD: COLORS.brightCyan,
  "SHARD MANAGER": COLORS.brightMagenta,
  "PLAYER PANEL": COLORS.brightGreen,
  "BLUEPRINT PANEL": COLORS.yellow,
  COMMANDS: COLORS.brightBlue,
  COMPONENTS: COLORS.magenta,
  EVENTS: COLORS.green,
  INTERACTIONS: COLORS.cyan,
  "DUNE API": COLORS.yellow,
  "DISCORD ADAPTER": COLORS.brightCyan,
  "DISCORD AUDIT": COLORS.brightGreen,
  "DISCORD AUDIT LOG": COLORS.brightMagenta,
  DASHBOARD: COLORS.brightOrange,
  default: COLORS.white,
});

export type LogContext = {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  [key: string]: unknown;
};

const secretKeyPattern = /(password|token|secret|cookie|authorization|session|api[-_]?key|access[-_]?token)/i;

function redact(value: unknown, key = ""): unknown {
  if (secretKeyPattern.test(key)) {
    return "[REDACTED]";
  }
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: process.env.NODE_ENV === "production" ? undefined : value.stack };
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redact(entryValue, entryKey)]));
  }
  return value;
}

function formatTimestamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return `${values.month}/${values.day}/${values.year} ${values.hour}:${values.minute}:${values.second} ${values.dayPeriod}`;
}

function formatDetails(details: unknown): string {
  if (details === undefined) {
    return "";
  }

  if (typeof details === "string") {
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

export function createLogger(scope: string, minimumLevel: string = process.env.LOG_LEVEL ?? "INFO"): Logger {
  const normalizedLevel = minimumLevel.toUpperCase() as LogLevel;
  const threshold = LEVELS[normalizedLevel] ?? LEVELS.INFO;
  const scopeColor = SCOPE_COLORS[scope] ?? SCOPE_COLORS.default;

  function write(level: LogLevel, message: string, details?: unknown): void {
    if (LEVELS[level] < threshold) {
      return;
    }

    const output = `${COLORS.dim}[${formatTimestamp(new Date())}]${COLORS.reset} ` + `${LEVEL_COLORS[level]}[${level}]${COLORS.reset} ` + `${scopeColor}[${scope}]${COLORS.reset} ` + message;
    const safeDetails = redact(details);
    const line = formatDetails(safeDetails);
    const formattedOutput = line ? `${output} ${line}` : output;

    if (level === "ERROR" || level === "FATAL") {
      console.error(formattedOutput);

      const error = details instanceof Error ? details : details && typeof details === "object" && "error" in details ? details.error : undefined;
      if (error instanceof Error) {
        Sentry.captureException(error, { extra: (redact(details) || {}) as Record<string, unknown> });
      }
      return;
    }

    if (level === "WARN") {
      console.warn(formattedOutput);
      return;
    }

    const method = level === "DEBUG" ? console.debug : console.info;
    method(formattedOutput);
  }

  return Object.freeze({
    header(title: string, subtitle = "Dune: Awakening Dashboard"): void {
      if (LEVELS.INFO < threshold) {
        return;
      }

      const banner = [
        "  ██████╗██████╗ ██╗███╗   ███╗███████╗ ██████╗ ███╗   ██╗    ███████╗██╗  ██╗██╗███████╗███████╗ ",
        " ██╔════╝██╔══██╗██║████╗ ████║██╔════╝██╔═══██╗████╗  ██║    ██╔════╝██║ ██╔╝██║██╔════╝██╔════╝ ",
        " ██║     ██████╔╝██║██╔████╔██║███████╗██║   ██║██╔██╗ ██║    ███████╗█████╔╝ ██║█████╗  ███████╗ ",
        " ██║     ██╔══██╗██║██║╚██╔╝██║╚════██║██║   ██║██║╚██╗██║    ╚════██║██╔═██╗ ██║██╔══╝  ╚════██║ ",
        " ╚██████╗██║  ██║██║██║ ╚═╝ ██║███████║╚██████╔╝██║ ╚████║    ███████║██║  ██╗██║███████╗███████║ ",
        "  ╚═════╝╚═╝  ╚═╝╚═╝╚═╝     ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═══╝    ╚══════╝╚═╝  ╚═╝╚═╝╚══════╝╚══════╝ ",
      ].join("\n");

      console.log(`\n${COLORS.yellow}${banner}${COLORS.reset}`);
      console.log(`${COLORS.cyan}${title}${COLORS.reset} ${COLORS.dim}- ${subtitle}${COLORS.reset}\n`);
    },
    debug: (message: string, details?: unknown) => write("DEBUG", message, details),
    info: (message: string, details?: unknown) => write("INFO", message, details),
    warn: (message: string, details?: unknown) => write("WARN", message, details),
    error: (message: string, error?: unknown) => write("ERROR", message, error),
    fatal: (message: string, error?: unknown) => write("FATAL", message, error),
  });
}

export const logger = createLogger("DASHBOARD");

export function createRequestLogger(context: LogContext): Logger {
  const requestLogger = createLogger("DASHBOARD");
  const mergeDetails = (details: unknown): LogContext => (details && typeof details === "object" && !Array.isArray(details) ? { ...context, ...(details as LogContext) } : { ...context, details });

  return {
    header: requestLogger.header,
    debug: (message, details) => requestLogger.debug(message, mergeDetails(details)),
    info: (message, details) => requestLogger.info(message, mergeDetails(details)),
    warn: (message, details) => requestLogger.warn(message, mergeDetails(details)),
    error: (message, error) => requestLogger.error(message, { ...context, error }),
    fatal: (message, error) => requestLogger.fatal(message, { ...context, error }),
  };
}

export { formatTimestamp };
