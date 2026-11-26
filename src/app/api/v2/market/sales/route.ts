import { route } from '../../../../../server/http';
import { getSales } from '../../../../../features/market/server/planner';
export const GET = route(getSales);
