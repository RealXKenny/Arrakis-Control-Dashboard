import { route } from '../../../../../../server/http';
import { getRegistration, mutateRegistration } from '../../../../../../features/events/server/registrations-http';

export const dynamic = 'force-dynamic';
export const GET = route(getRegistration);
export const POST = route(mutateRegistration);
