import { route } from '../../../../server/http';
import { getUpkeep, postUpkeep } from '../../../../features/upkeep/server/http';
export const GET = route(getUpkeep);
export const POST = route(postUpkeep);
