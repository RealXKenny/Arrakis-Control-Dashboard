import { route } from '../../../../../server/http';
import { getNotifications, putNotifications } from '../../../../../features/inbox/server/preferences-http';
export const GET = route(getNotifications);
export const POST = route(putNotifications);
