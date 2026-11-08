import { handlers } from '../../../../features/auth/server/config';

// Dev note: sign-in, callback, session and sign-out all hang off this one catch-all door.
export const { GET, POST } = handlers;
