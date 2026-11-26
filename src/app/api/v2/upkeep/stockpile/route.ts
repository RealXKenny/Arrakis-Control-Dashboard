import { route } from '../../../../../server/http';
import { getStockpile } from '../../../../../features/upkeep/server/http';
export const GET = route(getStockpile);
