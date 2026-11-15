import { route } from '../../../../../server/http';
import { getCommandAssets } from '../../../../../features/commands/server/http';
export const GET = route(getCommandAssets);
