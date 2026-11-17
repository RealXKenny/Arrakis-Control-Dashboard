import { route } from '../../../../../../server/http';
import { createMessage, getMessages } from '../../../../../../features/assistance/server/http';

export const dynamic = 'force-dynamic';
export const GET = route(getMessages);
export const POST = route(createMessage);
