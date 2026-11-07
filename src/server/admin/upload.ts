import '../../lib/assert-server';
import { AppError } from '../../lib/errors';
import { readBoundedBody } from '../../lib/http/bounded-body';
import { MAX_UPLOAD_BYTES, parseAdminRequest } from '../../modules/admin/server/request';
import { parseAdminJson } from '../../modules/admin/server/sanitize';

/** Validate a multipart admin upload and return the parsed operation plus the body to forward. */
export async function readAdminUpload(request: Request) {
  const contentType = request.headers.get('content-type');
  if (typeof contentType !== 'string' || !contentType.startsWith('multipart/form-data;'))
    throw new AppError('Choose files using the upload form.', 400, 'INVALID_UPLOAD', true);
  // The stream itself is counted, so a missing or false Content-Length cannot smuggle a large body.
  const bytes = await readBoundedBody(request, MAX_UPLOAD_BYTES + 128 * 1024);
  if (!bytes) throw new AppError('Upload exceeds 8 MiB.', 413, 'UPLOAD_TOO_LARGE', true);
  let form: FormData;
  try {
    form = await new Request('http://upload.local', {
      method: 'POST',
      headers: { 'Content-Type': contentType },
      body: bytes,
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
  const upload = parsed.operation.mode === 'upload' ? (outgoing.get('file') as File) : outgoing;
  return { parsed, upload };
}
