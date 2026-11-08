import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { providerUrl } from '../../../server/integrations/dunedocker/transport';
import { AppError } from '../../../lib/errors';
import { getServerEnv } from '../../../config/env';
import { readBoundedText } from '../../../lib/http/response';
import { createLogger } from '../../../lib/logger';
import type { DashboardSession } from '../../auth/server/session-store';
import { removeGuildStorage } from '../../guilds/server/membership';
import type { parseAdminRequest } from './request';
import { parseAdminJson, sanitizeAdminData } from './sanitize';

const log = createLogger('ADMIN');
const encoder = new TextEncoder();
const NO_STORE = 'no-store';
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/** Console must be reached over HTTPS, or loopback HTTP for local deployments. */
export function isSecureConsoleOrigin(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK.includes(url.hostname));
  } catch {
    return false;
  }
}

function downloadName(disposition: string | null, fallback: string) {
  const match = /filename\*?=(?:UTF-8''|")?([^";\r\n]+)/i.exec(disposition ?? '');
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
          const data = frame
            .split('\n')
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

/** Stop a relayed stream once it passes `maximumBytes`, and always release the provider connection. */
export function limitBytes(body: ReadableStream<Uint8Array>, maximumBytes: number, onStop: () => void) {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > maximumBytes) {
          controller.terminate();
          onStop();
          return;
        }
        controller.enqueue(chunk);
      },
      flush: onStop,
    }),
  );
}

export type ExecuteOptions = {
  /** Aborts the provider call; normally the incoming request's own signal. */
  signal?: AbortSignal;
  upload?: FormData | Blob;
  timeoutMs?: number;
};

/** Uses an operation ID from the catalog, never an arbitrary caller-supplied URL or credential. */
export async function executeAdminOperation(
  parsed: ReturnType<typeof parseAdminRequest>,
  session: DashboardSession,
  options: ExecuteOptions = {},
): Promise<Response> {
  const { operation, request, route } = parsed;
  const { upload } = options;
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
  if (!isSecureConsoleOrigin(env.CONSOLE_URL))
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
  const callerSignal = options.signal;
  const onClose = () => controller.abort();
  callerSignal?.addEventListener('abort', onClose, { once: true });
  const cleanup = () => {
    controller.abort();
    callerSignal?.removeEventListener('abort', onClose);
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
        AbortSignal.timeout(options.timeoutMs ?? (operation.mode === 'download' ? 120_000 : 60_000)),
      ]),
    });
    log.info('Administrator operation answered', {
      actorId: session.user.id,
      operation: operation.id,
      status: response.status,
    });
    const contentType = response.headers.get('content-type') ?? '';
    if (response.ok && operation.mode === 'events' && contentType.includes('text/event-stream') && response.body) {
      streaming = true;
      return new Response(limitBytes(sanitizedEvents(response.body), 2 * 1024 * 1024, cleanup), {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': NO_STORE,
          'X-Accel-Buffering': 'no',
        },
      });
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
      streaming = true;
      return new Response(limitBytes(response.body, maximumBytes, cleanup), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': NO_STORE,
        },
      });
    }
    const text = await readBoundedText(response, 16 * 1024 * 1024);
    let value: unknown = null;
    if (text.trim()) value = /json/i.test(contentType) ? parseAdminJson(text) : { text };
    const successful =
      response.ok && !(value && typeof value === 'object' && (value as Record<string, unknown>).ok === false);
    let warning: string | undefined;
    if (successful && operation.id === 'delete-guilds-guildid') {
      try {
        await removeGuildStorage(request.path.guildId);
      } catch {
        warning =
          'The guild was disbanded, but saved recruitment or chat data could not be cleared. Do not repeat the disband operation.';
      }
    }
    const safe = sanitizeAdminData(value);
    if (response.ok && operation.mode === 'download') {
      return new Response(JSON.stringify(safe.data, null, 2), {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${operation.id}.txt"`,
          'Cache-Control': NO_STORE,
        },
      });
    }
    const outgoing: Record<string, string> = { 'Cache-Control': NO_STORE };
    if (response.status === 429) {
      const retry = response.headers.get('retry-after') ?? '';
      outgoing['Retry-After'] = /^\d{1,5}$/.test(retry) ? retry : '30';
    }
    return Response.json(
      {
        ok: successful,
        ...(warning ? { warning } : {}),
        upstreamStatus: response.status,
        ...safe,
        ...(successful
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
        status:
          response.ok && !successful ? 502 : response.status === 204 || response.status === 205 ? 200 : response.status,
        headers: outgoing,
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
