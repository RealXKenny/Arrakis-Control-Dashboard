import { route } from '../../../../../server/http';
import { getContainers } from '../../../../../features/upkeep/server/http';
export const GET = route(getContainers);
