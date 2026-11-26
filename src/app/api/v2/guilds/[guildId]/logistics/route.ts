import { route } from '../../../../../../server/http';
import { getGuildLogistics, mutateGuildLogistics } from '../../../../../../features/guilds/server/logistics-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildLogistics);
export const POST = route(mutateGuildLogistics);
