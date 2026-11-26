import { route } from '../../../../../server/http';
import { getFleet } from '../../../../../features/vehicles/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getFleet);
