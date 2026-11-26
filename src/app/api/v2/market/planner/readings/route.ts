import { route } from '../../../../../../server/http';
import { getPlannerReadings } from '../../../../../../features/market/server/planner';
export const GET = route(getPlannerReadings);
