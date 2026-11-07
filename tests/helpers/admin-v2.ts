/** Request builders for the App Router administrator API tests. */
export const ADMIN_ORIGIN = 'https://dashboard.test';

export function adminPost(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
  contentType = 'application/json',
) {
  return new Request(`${ADMIN_ORIGIN}${path}`, {
    method: 'POST',
    headers: { origin: ADMIN_ORIGIN, 'content-type': contentType, ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

export async function adminUpload(path: string, metadata: unknown, files: Record<string, File>) {
  const form = new FormData();
  form.set('request', JSON.stringify(metadata));
  for (const [name, file] of Object.entries(files)) form.set(name, file);
  const encoded = new Request('https://upload.test', { method: 'POST', body: form });
  return new Request(`${ADMIN_ORIGIN}${path}`, {
    method: 'POST',
    headers: { origin: ADMIN_ORIGIN, 'content-type': encoded.headers.get('content-type')! },
    body: Buffer.from(await encoded.arrayBuffer()),
  });
}

export function adminGet(path: string) {
  return new Request(`${ADMIN_ORIGIN}${path}`, { method: 'GET', headers: { origin: ADMIN_ORIGIN } });
}
