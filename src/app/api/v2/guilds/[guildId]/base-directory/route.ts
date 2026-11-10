import { route } from '../../../../../../server/http';
import {
  getGuildBaseDirectory,
  mutateGuildBaseDirectory,
} from '../../../../../../features/guilds/server/base-directory-http';

export const dynamic = 'force-dynamic';
export const GET = route(getGuildBaseDirectory);
export const POST = route(mutateGuildBaseDirectory);
