/** Browser-safe reading of season API responses: never surfaces a raw JSON parser error to members. */
export class SeasonResponseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Worth retrying automatically: server, proxy or rate-limit trouble rather than a definite refusal. */
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'SeasonResponseError';
  }
}
const transient = (status: number) => status === 0 || status === 408 || status === 429 || status >= 500;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
export async function readSeasonResponse<T>(response: Response, fallback = 'Season request failed.'): Promise<T> {
  const text = await response.text();
  let data: unknown;
  try {
    data = text.trim() ? JSON.parse(text) : null;
  } catch {
    // Dev note: we asked for spice data and someone handed us a whole web page.
    throw new SeasonResponseError(
      `The dashboard answered with a web page instead of season data (HTTP ${response.status}). A proxy, firewall or restarting server sent it, not the season service`,
      response.status,
      // A proxy page on a success or redirect status is still not data; retry it like a server fault.
      true,
    );
  }
  if (!response.ok) {
    const error = record(data).error;
    throw new SeasonResponseError(
      typeof error === 'string' && error ? error : `${fallback} (HTTP ${response.status})`,
      response.status,
      transient(response.status),
    );
  }
  if (!data || typeof data !== 'object') throw new SeasonResponseError(fallback, response.status, true);
  return data as T;
}
/** Exponential backoff for automatic retries: 30 s, 60 s, 120 s, then every 5 minutes. */
export function retryDelayMs(failures: number) {
  return Math.min(300000, 30000 * 2 ** Math.max(0, failures - 1));
}
