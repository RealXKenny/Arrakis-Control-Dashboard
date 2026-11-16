import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import operations from '../catalog.json' with { type: 'json' };
import { isSecureConsoleOrigin } from './execute';

/** Non-secret catalog plus which credentials are configured; the Console origin only when it is safe to link. */
export function adminCatalog() {
  const env = getServerEnv();
  return {
    ok: true as const,
    operations,
    configured: Boolean(env.DUNE_API_KEY),
    adapterConfigured: Boolean(env.DUNE_ADAPTER_TOKEN),
    consoleOrigin:
      env.DUNE_API_URL && isSecureConsoleOrigin(env.DUNE_API_URL) ? new URL(env.DUNE_API_URL).origin : null,
  };
}
