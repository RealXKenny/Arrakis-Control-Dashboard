import { route } from '../../../../../server/http';
import { updateVolunteer } from '../../../../../features/assistance/server/http';

export const dynamic = 'force-dynamic';
export const POST = route(updateVolunteer);
