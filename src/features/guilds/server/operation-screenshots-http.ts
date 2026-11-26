import '../../../lib/assert-server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertSameOrigin, json } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { recordAudit } from '../../../lib/security/audit';
import { AppError } from '../../../lib/errors';
import { EVENT_SUBMISSION_IMAGE_MAX_BYTES } from '../../events/submissions';
import { processSubmissionImage } from '../../events/server/submission-image';
import { operationsView } from '../operations';
import { operationsAccess } from './operations-http';
import { addOperationScreenshot, readGuildOperations, readOperationScreenshot } from './operations-store';

type Context = { params: Promise<{ guildId: string; operationId: string; screenshotId?: string }> };
const uuid = z.uuid();
const uploadSchema = z.object({ revision: z.uuid(), caption: z.string().trim().max(200) }).strict();

async function target(ctx: Context) {
  const params = await ctx.params;
  if (
    !uuid.safeParse(params.operationId).success ||
    (params.screenshotId && !uuid.safeParse(params.screenshotId).success)
  )
    throw new AppError('Screenshot not found.', 404, 'OPERATION_SCREENSHOT_NOT_FOUND', true);
  return params;
}

/** Participants and leaders add static evidence; images are re-encoded to bounded WebP before storage. */
export async function uploadOperationScreenshot(request: Request, ctx: Context) {
  assertSameOrigin(request);
  const params = await target(ctx);
  const access = await operationsAccess({ params: Promise.resolve({ guildId: params.guildId }) }, true);
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))
    throw new AppError('Upload the screenshot as multipart form data.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const body = await readBoundedBody(request, EVENT_SUBMISSION_IMAGE_MAX_BYTES + 8_192);
  if (!body) throw new AppError('Screenshots must be no larger than 700 KiB.', 413, 'PAYLOAD_TOO_LARGE', true);
  let form: FormData;
  try {
    form = await new Response(body, { headers: { 'content-type': request.headers.get('content-type')! } }).formData();
  } catch {
    throw new AppError('The screenshot could not be read.', 400, 'INVALID_OPERATION_SCREENSHOT', true);
  }
  const input = uploadSchema.safeParse({
    revision: String(form.get('revision') ?? ''),
    caption: String(form.get('caption') ?? ''),
  });
  const file = form.get('image');
  if (!input.success || !(file instanceof File) || !file.size)
    throw new AppError(
      'Add a screenshot and a caption of up to 200 characters.',
      400,
      'INVALID_OPERATION_SCREENSHOT',
      true,
    );
  const image = await processSubmissionImage(new Uint8Array(await file.arrayBuffer()));
  const operation = await addOperationScreenshot(
    access.guildId,
    params.operationId,
    input.data.revision,
    { id: randomUUID(), caption: input.data.caption, bytes: image.bytes },
    access,
  );
  void recordAudit({
    event: 'guild.operation_screenshot_added',
    outcome: 'success',
    actor: access.session.user.id,
    data: { guildId: access.guildId, operationId: params.operationId },
  });
  return json(
    { ok: true, data: { operation: operationsView([operation], access.memberId, access.canEdit).operations[0] } },
    201,
  );
}

/** Screenshots are private guild records: fresh membership is checked on every image read. */
export async function getOperationScreenshot(_request: Request, ctx: Context) {
  const params = await target(ctx);
  const access = await operationsAccess({ params: Promise.resolve({ guildId: params.guildId }) }, false);
  const operation = (await readGuildOperations(access.guildId)).find((entry) => entry.id === params.operationId);
  const listed = operation?.screenshots?.some((entry) => entry.id === params.screenshotId);
  const bytes = listed ? await readOperationScreenshot(access.guildId, params.operationId, params.screenshotId!) : null;
  if (!bytes) throw new AppError('Screenshot not found.', 404, 'OPERATION_SCREENSHOT_NOT_FOUND', true);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
