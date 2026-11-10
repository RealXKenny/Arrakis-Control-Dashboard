import { route } from '../../../../../../server/http';
import { getGuildPolls, mutateGuildPolls } from '../../../../../../features/guilds/server/polls-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildPolls);
export const POST = route(mutateGuildPolls);
