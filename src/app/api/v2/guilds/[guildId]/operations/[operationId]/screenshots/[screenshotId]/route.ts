import { route } from '../../../../../../../../../server/http';
import { getOperationScreenshot } from '../../../../../../../../../features/guilds/server/operation-screenshots-http';

export const dynamic = 'force-dynamic';
export const GET = route(getOperationScreenshot);
