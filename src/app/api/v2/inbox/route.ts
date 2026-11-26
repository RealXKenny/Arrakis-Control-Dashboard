import { route } from '../../../../server/http';
import { getInbox } from '../../../../features/inbox/server/http';
export const GET = route(getInbox);
