import '../../lib/assert-server';
import { getServerEnv } from '../../lib/env';
import operations from '../../features/admin/catalog.json' with { type: 'json' };
import { isSecureConsoleOrigin } from './execute';

/** Non-secret catalog plus which credentials are configured; the Console origin only when it is safe to link. */
export function adminCatalog() {
  const env = getServerEnv();
  return {
    ok: true as const,
    operations,
    configured: Boolean(env.ADMIN_CONSOLE_API_KEY),
    adapterConfigured: Boolean(env.ADAPTER_TOKEN),
    consoleOrigin: env.CONSOLE_URL && isSecureConsoleOrigin(env.CONSOLE_URL) ? new URL(env.CONSOLE_URL).origin : null,
  };
}
