import { route } from '../../../../../server/http';
import { downloadPersonalData } from '../../../../../features/personal-data/server/http';
export const POST = route(downloadPersonalData);
