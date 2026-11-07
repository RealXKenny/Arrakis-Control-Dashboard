import { handlers } from '../../../../server/auth/config';

// Dev note: sign-in, callback, session and sign-out all hang off this one catch-all door.
export const { GET, POST } = handlers;
