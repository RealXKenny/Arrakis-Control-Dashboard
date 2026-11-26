import { route } from '../../../../../server/http';
import { getInventoryHistory, postInventoryHistory } from '../../../../../features/player/server/equipment';
export const GET = route(getInventoryHistory);
export const POST = route(postInventoryHistory);
