import * as Sentry from "@sentry/nextjs";

export type LogLevel = "debug" | "info" | "warn" | "error";

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

function write(level: LogLevel, message: string, context: LogContext = {}): void {
  const payload = { timestamp: new Date().toISOString(), level, message, ...redact(context) };
  const serialized = JSON.stringify(payload);

  if (process.env.NODE_ENV === "production") {
    if (level === "error") console.error(serialized);
    else if (level === "warn") console.warn(serialized);
    else console.info(serialized);
    return;
  }

  const method = level === "error" ? console.error : level === "warn" ? console.warn : level === "debug" ? console.debug : console.info;
  method(`[${level}] ${message}`, redact(context));
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  header: (title: string, subtitle: string, banner = "") => {
    console.info([banner, title, subtitle].filter(Boolean).join("\n"));
  },
  error: (message: string, context: LogContext = {}) => {
    write("error", message, context);
    const error = context.error;
    if (error instanceof Error) Sentry.captureException(error, { extra: redact(context) as Record<string, unknown> });
  },
};

export function createRequestLogger(context: LogContext) {
  return {
    debug: (message: string, extra?: LogContext) => logger.debug(message, { ...context, ...extra }),
    info: (message: string, extra?: LogContext) => logger.info(message, { ...context, ...extra }),
    warn: (message: string, extra?: LogContext) => logger.warn(message, { ...context, ...extra }),
    error: (message: string, extra?: LogContext) => logger.error(message, { ...context, ...extra }),
  };
}
