export async function guildRequest(url: string, body?: unknown) {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
  );
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Unable to complete the guild request.');
  return payload.data;
}
