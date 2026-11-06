import type { AdminOperation } from './types';

/** Browser helper for the dedicated screens; the server still authorizes, validates and redacts every call. */

export type AdminInput = {
  path?: Record<string, string>;
  query?: Record<string, string | number | boolean>;
  body?: Record<string, unknown>;
};
export type AdminOutcome = { data: unknown; warning?: string; upstreamStatus?: number };

export function findOperation(operations: readonly AdminOperation[], id: string) {
  return operations.find((entry) => entry.id === id);
}

/** Mutations are only sent from an explicit dialog, so the confirmation the gateway requires is attached here. */
export async function adminCall(
  operation: AdminOperation,
  input: AdminInput = {},
  signal?: AbortSignal,
): Promise<AdminOutcome> {
  const mutation = operation.method !== 'GET';
  const response = await fetch('/api/admin/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operation: operation.id,
      path: input.path ?? {},
      query: input.query ?? {},
      body: input.body ?? {},
      acknowledgement: mutation ? `${operation.method} ${operation.route}` : '',
    }),
    signal,
  });
  let result: Record<string, unknown> = {};
  try {
    result = await response.json();
  } catch {
    // A non-JSON failure falls through to the generic message below.
  }
  if (!response.ok || result.ok === false) {
    const reason = typeof result.error === 'string' ? result.error : 'The request failed.';
    const id = typeof result.requestId === 'string' ? ` Request ID: ${result.requestId}` : '';
    throw new Error(`${reason}${id}`);
  }
  return {
    data: result.data ?? result,
    warning: typeof result.warning === 'string' ? result.warning : undefined,
    upstreamStatus: typeof result.upstreamStatus === 'number' ? result.upstreamStatus : undefined,
  };
}
