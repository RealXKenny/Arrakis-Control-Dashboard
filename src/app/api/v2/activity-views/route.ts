import { route } from '../../../../server/http';
import { getActivityViews, postActivityViews } from '../../../../features/activity-views/server/http';
export const GET = route(getActivityViews);
export const POST = route(postActivityViews);
