import '../../../lib/assert-server';
import operations from '../catalog.json';
import { getServerEnv } from '../../../config/env';
import { NextResponse } from '../../../infrastructure/pages-api';
import { requireDashboardAdmin } from './access';

export async function GET(req, res) {
  await requireDashboardAdmin(req, res);
  const env = getServerEnv();
  const url = env.CONSOLE_URL ? new URL(env.CONSOLE_URL) : null;
  const consoleOrigin =
    url &&
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      ? url.origin
      : null;
  return NextResponse.json({ ok: true, operations, configured: Boolean(env.ADMIN_CONSOLE_API_KEY), consoleOrigin });
}
