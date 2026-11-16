import { route } from '../../../../../server/http';
import { getPortalLayout, putPortalLayout } from '../../../../../features/portal/server/layout-http';
export const GET = route(getPortalLayout);
export const POST = route(putPortalLayout);
