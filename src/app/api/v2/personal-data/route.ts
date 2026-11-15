import { route } from '../../../../server/http';
import { getPersonalData } from '../../../../features/personal-data/server/http';
export const GET = route(getPersonalData);
