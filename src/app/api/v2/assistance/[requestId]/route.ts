import { route } from '../../../../../server/http';
import { mutateAssistanceRequest } from '../../../../../features/assistance/server/http';

export const dynamic = 'force-dynamic';
export const POST = route(mutateAssistanceRequest);
