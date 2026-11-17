import { route } from '../../../../../server/http';
import { deletePersonalData } from '../../../../../features/personal-data/server/http';
export const POST = route(deletePersonalData);
