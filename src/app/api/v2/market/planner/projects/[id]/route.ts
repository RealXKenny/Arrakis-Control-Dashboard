import { route } from '../../../../../../../server/http';
import { getProjectComparison } from '../../../../../../../features/market/server/planner';
export const GET = route(getProjectComparison);
