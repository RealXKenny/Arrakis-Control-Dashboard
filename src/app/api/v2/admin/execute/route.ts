import { AppError } from '../../../../../lib/errors';
import { readBoundedBody } from '../../../../../lib/http/bounded-body';
import { parseAdminRequest } from '../../../../../modules/admin/server/request';
import { parseAdminJson } from '../../../../../modules/admin/server/sanitize';
import { assertSameOrigin, route } from '../../../../../server/http';
import { requireApiAdmin } from '../../../../../server/admin/access';
import { executeAdminOperation } from '../../../../../server/admin/execute';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 128 * 1024;

export const POST = route(async (request) => {
  // Same-origin first, then authority from the verified server session; the body never grants anything.
  assertSameOrigin(request);
  const session = await requireApiAdmin();
  const bytes = await readBoundedBody(request, MAX_BODY_BYTES);
  if (!bytes) throw new AppError('Request exceeds 128 KiB.', 413, 'REQUEST_TOO_LARGE', true);
  const text = new TextDecoder().decode(bytes);
  let body: unknown;
  try {
    // Native form posts stream downloads straight to the browser without buffering them in client JS.
    if ((request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')) {
      const field = new URLSearchParams(text).get('request');
      if (typeof field !== 'string') throw new Error('missing');
      body = parseAdminJson(field);
    } else {
      body = parseAdminJson(text);
    }
  } catch {
    throw new AppError('Invalid request JSON.', 400, 'INVALID_REQUEST', true);
  }
  const parsed = parseAdminRequest(body);
  if (['multipart', 'upload'].includes(parsed.operation.mode))
    throw new AppError('This operation requires the upload form.', 400, 'UPLOAD_REQUIRED', true);
  return executeAdminOperation(parsed, session, { signal: request.signal });
});
