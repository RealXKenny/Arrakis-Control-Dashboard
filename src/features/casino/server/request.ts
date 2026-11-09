import '../../../lib/assert-server';
import type { z } from 'zod';
import { AppError } from '../../../lib/errors';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { assertSameOrigin, requireApiSession } from '../../../server/http';

/** Same-origin check, session, and a bounded JSON body parsed against a schema. For mutating casino routes. */
export async function mutation<T extends z.ZodType>(request: Request, schema: T, maxBytes = 8 * 1024) {
  const session = await requireApiSession();
  assertSameOrigin(request);
  const bytes = await readBoundedBody(request, maxBytes);
  if (!bytes) throw new AppError('Request is too large.', 413, 'BODY_TOO_LARGE', true);
  let input: z.infer<T>;
  try {
    input = schema.parse(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new AppError('Invalid request.', 400, 'INVALID_REQUEST', true);
  }
  return { session, input };
}

/** Round and request identifiers: conservative characters only, so they are safe in Redis keys. */
export const ID_PATTERN = /^[A-Za-z0-9_.-]{1,80}$/;
