import { route } from '../../../../../../server/http';
import { getGuildNoticeboard, mutateGuildNoticeboard } from '../../../../../../features/guilds/server/noticeboard-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildNoticeboard);
export const POST = route(mutateGuildNoticeboard);
