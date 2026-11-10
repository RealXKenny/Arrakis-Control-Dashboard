import { route } from '../../../../../../server/http';
import { getGuildOperations, mutateGuildOperations } from '../../../../../../features/guilds/server/operations-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildOperations);
export const POST = route(mutateGuildOperations);
