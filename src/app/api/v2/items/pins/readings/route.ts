import { route } from '../../../../../../server/http';
import { getItemPinReadings } from '../../../../../../features/player/server/item-pins';
export const GET = route(getItemPinReadings);
