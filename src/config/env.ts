/**
 * Backwards-compatibility shim.
 *
 * The canonical environment contract lives in `src/lib/env.ts` (strict Zod
 * schema, production startup gate). Pages Router modules keep importing this
 * path during the App Router cutover; new code should import from `../lib/env`.
 */
export { getServerEnv, requireServerEnv, getDiscordRedirectUri, validateProductionEnv } from '../lib/env';
export type { ServerEnv } from '../lib/env';
