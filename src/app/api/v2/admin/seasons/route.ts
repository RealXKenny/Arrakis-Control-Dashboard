import { route } from '../../../../../server/http';
import { getAdminSeasons, mutateAdminSeasons } from '../../../../../features/seasons/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getAdminSeasons);
export const POST = route(mutateAdminSeasons);
