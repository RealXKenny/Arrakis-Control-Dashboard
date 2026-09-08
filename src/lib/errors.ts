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
