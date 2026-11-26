import { route } from '../../../../../../server/http';
import { getGuildProjects, mutateGuildProjects } from '../../../../../../features/guilds/server/projects-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildProjects);
export const POST = route(mutateGuildProjects);
