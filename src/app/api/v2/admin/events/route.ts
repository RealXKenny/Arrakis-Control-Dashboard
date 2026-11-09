import { route } from '../../../../../server/http';
import { getAdminEvents, mutateAdminEvent } from '../../../../../features/events/server/admin';

export const dynamic = 'force-dynamic';
export const GET = route(getAdminEvents);
export const POST = route(mutateAdminEvent);
export const PATCH = route(mutateAdminEvent);
export const DELETE = route(mutateAdminEvent);
