import { route } from '../../../../server/http';
import { getSeasons, mutateSeasons } from '../../../../features/seasons/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getSeasons);
export const POST = route(mutateSeasons);
