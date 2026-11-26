import '../../../lib/assert-server';
import { json, requireApiSession } from '../../../server/http';
import { checkRateLimit } from '../../../lib/security/rate-limit';
import { AppError } from '../../../lib/errors';
import { readCargo, readFleet } from './fleet';

async function limited(userId: string) {
  // Fleet and cargo reads share one budget: each fans out to several Console permission reads.
  const limit = await checkRateLimit(`v2:fleet:${userId}`, { limit: 6, windowMs: 60_000 });
  if (!limit.allowed) throw new AppError('Fleet check limit reached. Try again shortly.', 429, 'RATE_LIMITED', true);
}

/** GET /api/v2/vehicles/fleet: the verified character's fleet with per-vehicle roster checks. */
export async function getFleet(request: Request) {
  const session = await requireApiSession();
  await limited(session.user.id);
  return json(await readFleet(session, request.signal));
}

/** GET /api/v2/vehicles/cargo?vehicle=<id>: cargo totals for one vehicle the character can access. */
export async function getCargo(request: Request) {
  const session = await requireApiSession();
  const vehicle = new URL(request.url).searchParams.get('vehicle') ?? '';
  if (!/^[1-9][0-9]{0,15}$/.test(vehicle)) throw new AppError('Choose a vehicle.', 400, 'INVALID_VEHICLE', true);
  await limited(session.user.id);
  return json(await readCargo(session, vehicle, request.signal));
}
