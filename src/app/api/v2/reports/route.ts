import { route } from '../../../../server/http';
import { createReport, getReports } from '../../../../features/moderation/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getReports);
export const POST = route(createReport);
