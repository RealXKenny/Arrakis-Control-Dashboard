import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { getServerEnv } from '../../../config/env';
import { NextResponse, isSameOriginRequest } from '../../../infrastructure/pages-api';
import { providerUrl } from '../../../infrastructure/dunedocker/transport';
import { AppError } from '../../../lib/errors';
import { readBoundedText } from '../../../lib/http-response';
import { createLogger } from '../../../lib/logger';
import type { DashboardSession } from '../../../lib/session-store';
import { requireDashboardAdmin } from './access';
import { parseAdminRequest } from './request';
import { parseAdminJson, sanitizeAdminData } from './sanitize';

const log = createLogger('ADMIN');
const encoder = new TextEncoder();

function downloadName(disposition: string | null, fallback: string) {
  const match = /filename\*?=(?:UTF-8''|\")?([^\";\r\n]+)/i.exec(disposition ?? '');
  if (!match) return fallback;
  let name = match[1];
  try {
    name = decodeURIComponent(name);
  } catch {
    return fallback;
  }
  return /^[A-Za-z0-9][A-Za-z0-9_. -]{0,180}\.(?:json|csv|tar|gz|enc|dump|sql|zip|backup|bin|log|txt|yaml|yml|bak|dat)$/i.test(
    name,
  )
    ? name
    : fallback;
}

/** SSE frames are sanitized on the server before any log or task text reaches the browser. */
export function sanitizedEvents(body: ReadableStream<Uint8Array>) {
  let pending = '';
  const decoder = new TextDecoder();
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        pending = (pending + decoder.decode(chunk, { stream: true })).replaceAll('\r\n', '\n');
        if (pending.length > 64 * 1024) throw new Error('Event frame exceeds limit');
        let boundary: number;
        while ((boundary = pending.indexOf('\n\n')) !== -1) {
          const frame = pending.slice(0, boundary);
          pending = pending.slice(boundary + 2);
          const lines = frame.split('\n');
          const data = lines
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trimStart())
            .join('\n');
          if (!data) continue;
          let value: unknown = data;
          try {
            value = parseAdminJson(data);
          } catch {
            /* Text log frames are valid SSE too. */
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(sanitizeAdminData(value))}\n\n`));
        }
      },
    }),
  );
}

/** Uses an operation ID from the catalog, never an arbitrary caller-supplied URL or credential. */
export async function executeOperation(
  parsed: ReturnType<typeof parseAdminRequest>,
  session: DashboardSession,
  res,
  upload?: FormData | Blob,
) {
  const { operation, request, route } = parsed;
  const env = getServerEnv();
  const key = operation.provider === 'adapter' ? env.ADAPTER_TOKEN : env.ADMIN_CONSOLE_API_KEY;
  if (!env.CONSOLE_URL || !key)
    throw new AppError(
      operation.provider === 'adapter'
        ? 'Configure ADAPTER_TOKEN for adapter operations.'
        : 'Configure a separate ADMIN_CONSOLE_API_KEY for administration.',
      503,
      'ADMIN_CONFIG_REQUIRED',
      true,
    );
  const origin = new URL(env.CONSOLE_URL);
  if (
    origin.protocol !== 'https:' &&
    !(origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))
  )
    throw new AppError(
      'Administrator requests require Console HTTPS or loopback HTTP.',
      503,
      'ADMIN_SECURE_TRANSPORT_REQUIRED',
      true,
    );
  const url = providerUrl(env.CONSOLE_URL, route);
  for (const [name, value] of Object.entries(request.query)) url.searchParams.set(name, String(value));
  let body: BodyInit | undefined = upload;
  const headers: Record<string, string> = { Authorization: `Bearer ${key}` };
  const actor = {
    guildId: session.guildId,
    userId: session.user.id,
    username: session.user.username,
    roleIds: session.roleIds,
    channelId: 'dashboard-admin',
    interactionId: randomUUID(),
    commandName: 'administration',
  };
  if (operation.provider === 'adapter' && operation.method === 'GET')
    url.searchParams.set('actor', JSON.stringify(actor));
  if (!upload && operation.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(operation.provider === 'adapter' ? { ...request.body, actor } : request.body);
  }
  if (upload instanceof Blob) headers['Content-Type'] = 'application/octet-stream';
  const controller = new AbortController();
  const close = () => controller.abort();
  res.once?.('close', close);
  const cleanup = () => {
    controller.abort();
    res.removeListener?.('close', close);
  };
  let streaming = false;
  const mutation = operation.method !== 'GET';
  log.info('Administrator operation requested', { actorId: session.user.id, operation: operation.id, mutation });
  try {
    const response = await fetch(url, {
      method: operation.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(operation.mode === 'download' ? 120_000 : 60_000),
      ]),
    });
    log.info('Administrator operation answered', {
      actorId: session.user.id,
      operation: operation.id,
      status: response.status,
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && operation.mode === 'events' && contentType.includes('text/event-stream') && response.body) {
      const result = new NextResponse(null, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' },
      });
      result.stream = { body: sanitizedEvents(response.body), maximumBytes: 2 * 1024 * 1024, cleanup };
      streaming = true;
      return result;
    }
    if (response.ok && operation.mode === 'download' && response.body && !route.startsWith('/api/logs/')) {
      const size = Number(response.headers.get('content-length'));
      const maximumBytes = 128 * 1024 * 1024;
      if (Number.isFinite(size) && size > maximumBytes)
        throw new AppError(
          'Download exceeds the 128 MiB transfer limit. Use the Console directly for larger archives.',
          413,
          'TRANSFER_TOO_LARGE',
          true,
        );
      const extension = /csv/.test(contentType)
        ? 'csv'
        : /json/.test(contentType)
          ? 'json'
          : route.startsWith('/api/backups/system/')
            ? request.query.raw === '1'
              ? 'tar.gz.enc'
              : 'tar'
            : 'bin';
      const filename = downloadName(response.headers.get('content-disposition'), `${operation.id}.${extension}`);
      // Forward only a validated archive basename; never cookies, redirects, HTML or cache directives.
      const result = new NextResponse(null, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
      result.stream = { body: response.body, maximumBytes, cleanup };
      streaming = true;
      return result;
    }
    const text = await readBoundedText(response, 16 * 1024 * 1024);
    let value: unknown = null;
    if (text.trim()) value = /json/i.test(contentType) ? parseAdminJson(text) : { text };
    const safe = sanitizeAdminData(value);
    if (response.ok && operation.mode === 'download') {
      return new NextResponse(JSON.stringify(safe.data, null, 2), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${operation.id}.txt"`,
        },
      });
    }
    return NextResponse.json(
      {
        ok: response.ok,
        upstreamStatus: response.status,
        ...safe,
        ...(response.ok
          ? {}
          : {
              error:
                response.status === 403
                  ? 'The configured credential does not permit this operation.'
                  : 'Console declined the operation. Review the sanitized result.',
              code: 'CONSOLE_OPERATION_FAILED',
            }),
      },
      {
        status: response.status === 204 || response.status === 205 ? 200 : response.status,
        headers:
          response.status === 429
            ? {
                'Retry-After': /^\d{1,5}$/.test(response.headers.get('retry-after') ?? '')
                  ? response.headers.get('retry-after')!
                  : '30',
              }
            : {},
      },
    );
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      mutation
        ? 'The operation outcome is unknown. Check Console state before retrying; changes are never retried automatically.'
        : 'Console data is temporarily unavailable.',
      502,
      mutation ? 'OPERATION_OUTCOME_UNKNOWN' : 'UPSTREAM_ERROR',
      true,
    );
  } finally {
    if (!streaming) cleanup();
  }
}

export async function POST(req, res) {
  const session = await requireDashboardAdmin(req, res);
  if (!isSameOriginRequest(req)) throw new AppError('Same-origin request required.', 403, 'FORBIDDEN', true);
  let body = req.body;
  // Native form posts stream downloads directly to the browser without buffering them in client JS.
  if (typeof body?.request === 'string') {
    try {
      body = parseAdminJson(body.request);
    } catch {
      throw new AppError('Invalid request JSON.', 400, 'INVALID_REQUEST', true);
    }
  }
  const parsed = parseAdminRequest(body);
  if (['multipart', 'upload'].includes(parsed.operation.mode))
    throw new AppError('This operation requires the upload form.', 400, 'UPLOAD_REQUIRED', true);
  return executeOperation(parsed, session, res);
}
