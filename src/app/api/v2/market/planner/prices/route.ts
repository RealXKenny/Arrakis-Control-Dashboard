import { route } from '../../../../../../server/http';
import { getPriceHistory } from '../../../../../../features/market/server/planner';
export const GET = route(getPriceHistory);
