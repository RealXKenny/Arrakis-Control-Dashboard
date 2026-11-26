import { route } from '../../../../../server/http';
import { getPlanner, putPlanner } from '../../../../../features/market/server/planner';
export const GET = route(getPlanner);
export const POST = route(putPlanner);
