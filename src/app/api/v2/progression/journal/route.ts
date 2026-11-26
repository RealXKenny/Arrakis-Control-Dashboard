import { route } from '../../../../../server/http';
import { postJournal } from '../../../../../features/progression/server/http';
export const POST = route(postJournal);
