import { solarisApi, solarisMutation } from '../../../../features/solaris/server/http';
import { route } from '../../../../server/http';

export const dynamic = 'force-dynamic';
export const GET = route(solarisApi);
export const POST = route(solarisMutation);
