// Browser-side calls for the poker Activity. Relative URLs go through Discord's proxy inside the Activity frame.
import type { ActivitySessionResponse, PokerErrorResponse, PokerTableResponse, TableActionInput } from '../contracts';

export class PokerRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

async function parse<T>(response: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok || !body || typeof body !== 'object' || (body as { ok?: unknown }).ok !== true) {
    const failure = body as Partial<PokerErrorResponse> | null;
    throw new PokerRequestError(
      typeof failure?.error === 'string' ? failure.error : 'Something went wrong. Try again.',
      response.status,
      typeof failure?.code === 'string' ? failure.code : 'UNKNOWN',
    );
  }
  return body as T;
}

export async function startActivitySession(code: string, instanceId: string): Promise<ActivitySessionResponse> {
  const response = await fetch('/api/v2/poker/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, instanceId }),
    cache: 'no-store',
  });
  return parse<ActivitySessionResponse>(response);
}

export async function fetchTable(token: string, signal?: AbortSignal): Promise<PokerTableResponse> {
  const response = await fetch('/api/v2/poker/table', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });
  return parse<PokerTableResponse>(response);
}

export async function sendAction(token: string, input: TableActionInput): Promise<PokerTableResponse> {
  const response = await fetch('/api/v2/poker/table', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  return parse<PokerTableResponse>(response);
}
