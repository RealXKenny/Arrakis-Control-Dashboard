import { route } from '../../../../../server/http';
import { getOverview } from '../../../../../features/upkeep/server/http';
export const GET = route(getOverview);
