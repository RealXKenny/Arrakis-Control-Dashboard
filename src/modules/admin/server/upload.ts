import '../../../lib/assert-server';
import { NextResponse, isSameOriginRequest } from '../../../infrastructure/pages-api';
import { AppError } from '../../../lib/errors';
import { requireDashboardAdmin } from './access';
import { executeOperation } from './execute';
import { MAX_UPLOAD_BYTES, parseAdminRequest } from './request';
import { parseAdminJson } from './sanitize';

export async function POST(req, res): Promise<NextResponse> {
  const session = await requireDashboardAdmin(req, res);
  if (!isSameOriginRequest(req)) throw new AppError('Same-origin request required.', 403, 'FORBIDDEN', true);
  const contentType = req.headers['content-type'];
  if (typeof contentType !== 'string' || !contentType.startsWith('multipart/form-data;'))
    throw new AppError('Choose files using the upload form.', 400, 'INVALID_UPLOAD', true);
  const chunks: Buffer[] = [];
  let bytes = 0;
  const maximum = MAX_UPLOAD_BYTES + 128 * 1024;
  if (Number(req.headers['content-length']) > maximum)
    throw new AppError('Upload exceeds 8 MiB.', 413, 'UPLOAD_TOO_LARGE', true);
  // Reject oversized bodies even when Content-Length is absent or false.
  const deadline = setTimeout(
    () => req.destroy(new AppError('Upload timed out.', 408, 'UPLOAD_TIMEOUT', true)),
    30_000,
  );
  try {
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > maximum) throw new AppError('Upload exceeds 8 MiB.', 413, 'UPLOAD_TOO_LARGE', true);
      chunks.push(Buffer.from(chunk));
    }
  } finally {
    clearTimeout(deadline);
  }
  let form: FormData;
  try {
    form = await new Request('http://upload.local', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: Buffer.concat(chunks),
    }).formData();
  } catch {
    throw new AppError('Invalid multipart form.', 400, 'INVALID_UPLOAD', true);
  }
  const metadata = form.get('request');
  if (typeof metadata !== 'string' || metadata.length > 64 * 1024)
    throw new AppError('Missing operation metadata.', 400, 'INVALID_REQUEST', true);
  let raw: unknown;
  try {
    raw = parseAdminJson(metadata);
  } catch {
    throw new AppError('Invalid operation JSON.', 400, 'INVALID_REQUEST', true);
  }
  const parsed = parseAdminRequest(raw);
  if (!['multipart', 'upload'].includes(parsed.operation.mode))
    throw new AppError('This operation does not accept uploads.', 400, 'INVALID_UPLOAD', true);
  const allowed = parsed.operation.files ?? [];
  if ([...form.keys()].some((key) => key !== 'request' && !allowed.includes(key)))
    throw new AppError('Unexpected upload field.', 400, 'INVALID_UPLOAD', true);
  const outgoing = new FormData();
  if (Object.keys(parsed.request.body).some((key) => allowed.includes(key)))
    throw new AppError('File fields must be uploaded as files.', 400, 'INVALID_UPLOAD', true);
  let total = 0;
  for (const name of allowed) {
    const file = form.get(name);
    if (!(file instanceof File) || form.getAll(name).length !== 1 || !file.size || /[\\/\r\n\u0000]/.test(file.name))
      throw new AppError(`Choose a valid ${name} file.`, 400, 'INVALID_UPLOAD', true);
    total += file.size;
    if (total > MAX_UPLOAD_BYTES)
      throw new AppError('Files exceed the combined 8 MiB limit.', 413, 'UPLOAD_TOO_LARGE', true);
    outgoing.set(name, file, file.name);
  }
  for (const [name, value] of Object.entries(parsed.request.body))
    outgoing.set(name, typeof value === 'string' ? value : JSON.stringify(value));
  return executeOperation(
    parsed,
    session,
    res,
    parsed.operation.mode === 'upload' ? (outgoing.get('file') as File) : outgoing,
  );
}
