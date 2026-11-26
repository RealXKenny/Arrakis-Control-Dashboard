/** Browser-side request helper for the market planner. Errors carry the server's safe message and status. */
class PlannerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function plannerFetch<T>(
  path: string,
  init: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<T> {
  const { timeoutMs = 15_000, signal, ...rest } = init;
  const signals = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
  const response = await fetch(path, { cache: 'no-store', ...rest, signal: AbortSignal.any(signals) });
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    value = null;
  }
  if (!response.ok) {
    const error =
      value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
        ? (value as { error: string }).error
        : 'The market planner request failed.';
    throw new PlannerRequestError(error, response.status);
  }
  return value as T;
}

export const errorText = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

export function formatTime(value: string | null | undefined): string {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : 'Unknown time';
}
