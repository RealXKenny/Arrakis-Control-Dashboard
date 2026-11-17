import { route } from '../../../../server/http';
import { createAssistanceRequest, getAssistanceBoard } from '../../../../features/assistance/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getAssistanceBoard);
export const POST = route(createAssistanceRequest);
