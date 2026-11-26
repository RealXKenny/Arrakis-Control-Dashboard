import { route } from '../../../../../server/http';
import { getCargo } from '../../../../../features/vehicles/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getCargo);
