import { route } from '../../../../../../server/http';
import { getSharedRescue } from '../../../../../../features/expeditions/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getSharedRescue);
