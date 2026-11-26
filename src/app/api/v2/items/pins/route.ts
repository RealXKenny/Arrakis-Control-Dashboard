import { route } from '../../../../../server/http';
import { getItemPins, putItemPins } from '../../../../../features/player/server/item-pins';
export const GET = route(getItemPins);
export const POST = route(putItemPins);
