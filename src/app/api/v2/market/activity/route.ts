import { route } from '../../../../../server/http';
import { getActivity } from '../../../../../features/market/server/planner';
export const GET = route(getActivity);
