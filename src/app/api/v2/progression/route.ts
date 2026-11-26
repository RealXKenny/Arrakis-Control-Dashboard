import { route } from '../../../../server/http';
import { getPlanner, postPlanner } from '../../../../features/progression/server/http';
export const GET = route(getPlanner);
export const POST = route(postPlanner);
