import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      /** Discord user ID. */
      id: string;
      /** In-game name: the linked character, else the Discord display name. */
      ign: string;
      needsPassword: boolean;
    } & Pick<DefaultSession['user'] & object, 'name' | 'image'>;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    /** Opaque Redis session id: the value of the `dashboard_session` cookie. */
    sid?: string;
    discordId?: string;
    username?: string;
    globalName?: string;
    avatar?: string | null;
    guildId?: string;
    roleIds?: string[];
    linkedPlayerId?: string;
    linkedPlayerName?: string;
    needsPassword?: boolean;
    verifiedAt?: number;
    authenticatedAt?: number;
    expiresAt?: number;
    ign?: string;
  }
}
