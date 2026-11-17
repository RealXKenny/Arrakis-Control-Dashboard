export class GuildRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function guildRequest(url: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(
    url,
    body === undefined
      ? { signal }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal,
        },
  );
  const payload = await response.json();
  if (!response.ok || !payload.ok)
    throw new GuildRequestError(payload.error || 'Unable to complete the guild request.', response.status);
  return payload.data;
}
