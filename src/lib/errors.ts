export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(message: string, statusCode = 500, code = 'INTERNAL_ERROR', expose = false) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.expose = expose;
  }
}

export function getSafeError(error: unknown): { message: string; statusCode: number; code: string } {
  if (error instanceof AppError && error.expose) {
    return { message: error.message, statusCode: error.statusCode, code: error.code };
  }
  return { message: 'Internal server error', statusCode: 500, code: 'INTERNAL_ERROR' };
}

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,40}$/u;
const CONNECTION_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s'"]+/giu;

/**
 * One-line, credential-free reason for an operational failure (Redis, sockets, upstream I/O).
 * The logger hides `Error.message` in production, so warnings pass this string instead to stay
 * actionable: "ECONNREFUSED: connect ECONNREFUSED 10.0.0.5:6379" rather than "Internal error".
 */
export function describeOperationalError(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown error';
  // Dev note: connection strings are scrubbed before they can wander into the logs.
  const message = error.message.replace(CONNECTION_URL, '[redacted-url]').replace(/\s+/gu, ' ').trim().slice(0, 200);
  const code = (error as { code?: unknown }).code;
  const safeCode = typeof code === 'string' && SAFE_ERROR_CODE.test(code) ? code : undefined;
  const text = message || error.name || 'unknown error';
  return safeCode && !text.includes(safeCode) ? `${safeCode}: ${text}` : text;
}
