import { handlers } from '../../../../features/auth/server/config';
import { limitAuthRequests, type AuthHandler } from '../../../../features/auth/server/endpoint-limit';

// Dev note: sign-in, callback, session and sign-out all hang off this one catch-all door.
export const GET = limitAuthRequests(handlers.GET as AuthHandler);
export const POST = limitAuthRequests(handlers.POST as AuthHandler);
