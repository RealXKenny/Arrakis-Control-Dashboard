import { route } from '../../../../../../server/http';
import {
  getGuildResourceRequests,
  mutateGuildResourceRequests,
} from '../../../../../../features/guilds/server/resource-requests-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildResourceRequests);
export const POST = route(mutateGuildResourceRequests);
