import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';

/** Only the canonical public origin is serialized; the environment object stays server-side. */
export function getShareProps() {
  const configured = getServerEnv().APP_URL;
  return { shareOrigin: configured ? new URL(configured).origin : null };
}
