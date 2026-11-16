import '../../../lib/assert-server';
import { assertSameOrigin, json, requireApiSession } from '../../../server/http';
import { readBoundedBody } from '../../../lib/http/bounded-body';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { taskInputSchema } from '../model';
import { readPersonalTasks, mutatePersonalTasks } from './store';
async function owner() {
  const session = await requireApiSession();
  const limit = await checkRateLimit(`v2:personal-tasks:${session.user.id}`, { limit: 30, windowMs: 60000 });
  if (!limit.allowed || limit.storageUnavailable)
    throw new AppError(
      'Personal task requests are temporarily limited.',
      limit.storageUnavailable ? 503 : 429,
      'TASKS_LIMITED',
      true,
    );
  return session.user.id;
}
export async function getTasks() {
  return json({ record: await readPersonalTasks(await owner()) });
}
export async function putTasks(request: Request) {
  assertSameOrigin(request);
  const id = await owner();
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json')
    throw new AppError('Send task details as JSON.', 415, 'UNSUPPORTED_MEDIA_TYPE', true);
  const bytes = await readBoundedBody(request, 16384);
  if (!bytes) throw new AppError('Task details exceed the request limit.', 413, 'PAYLOAD_TOO_LARGE', true);
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AppError('Enter valid task details.', 400, 'INVALID_TASK', true);
  }
  const parsed = taskInputSchema.safeParse(raw);
  if (!parsed.success) throw new AppError('Check the title, notes, date and target fields.', 400, 'INVALID_TASK', true);
  return json({ record: await mutatePersonalTasks(id, parsed.data) });
}
