import { createSession } from '../../../../../features/poker/server/handlers';
import { route } from '../../../../../server/http';

export const POST = route(createSession);
