import { route } from '../../../../../../../../server/http';
import { uploadOperationScreenshot } from '../../../../../../../../features/guilds/server/operation-screenshots-http';

export const dynamic = 'force-dynamic';
export const POST = route(uploadOperationScreenshot);
