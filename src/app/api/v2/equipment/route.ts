import { route } from '../../../../server/http';
import { getPlanner, putPlanner } from '../../../../features/player/server/equipment';
export const GET = route(getPlanner);
export const POST = route(putPlanner);
