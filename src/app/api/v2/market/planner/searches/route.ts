import { route } from '../../../../../../server/http';
import { deleteSearches } from '../../../../../../features/market/server/planner';
export const DELETE = route(deleteSearches);
