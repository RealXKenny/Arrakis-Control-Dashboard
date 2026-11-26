import { route } from '../../../../../server/http';
import { getEquipmentReadings } from '../../../../../features/player/server/equipment';
export const GET = route(getEquipmentReadings);
