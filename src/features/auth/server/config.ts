import '../../../lib/assert-server';
import NextAuth, { type NextAuthConfig, type User } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';
import { discordAvatarUrl, navIdentity } from '../identity';
import { loginSchema } from '../schemas';
import { readDiscordIdentity, refreshDiscordIdentity } from '../../../server/integrations/discord';
import { getServerEnv, requireServerEnv } from '../../../config/env';
import { logger } from '../../../lib/logger';
import { recordAudit } from '../../../lib/security/audit';
import { getClientAddress } from '../../../lib/security/rate-limit';
import { checkPasswordLoginLimits } from './login-limits';
import { deleteSession, saveSession, sessionTtlSeconds, type DashboardSession } from './session-store';
import { getSession } from './session';
import { randomBytes } from 'node:crypto';
import { openSecret, sealSecret, verifyPassword } from './password';
import { claimEmail, getAccount, getAccountByEmail, saveAccount } from './users';

/**
 * Auth.js is the login layer; the Redis session record stays the authorization source.
 *
 * Auth.js is told to use an opaque session id as its "JWT" (custom `jwt.encode`/`decode`) and to name
 * its cookie `dashboard_session`. That keeps the cookie small, revocable and httpOnly, and means every
 * existing guard (`currentSession`, the legacy API handlers, ownership and admin checks) keeps reading
 * the same record, now with a 30-day lifetime.
 */
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-dashboard_session' : 'dashboard_session';

type Claims = {
  discordId: string;
  username?: string;
  globalName?: string;
  avatar: string | null;
  guildId: string;
  roleIds: string[];
  email?: string;
  needsPassword: boolean;
};

type DashboardUser = User & { dashboard?: Claims; denied?: 'role' | 'guild' | 'unavailable' };

const clean = (value: unknown, max: number) => (typeof value === 'string' ? value.slice(0, max) : undefined);

/** Shared by both providers: the guild role check from the old callback, applied to fresh Discord data. */
async function claimsFromDiscord(
  identity: Awaited<ReturnType<typeof readDiscordIdentity>>,
  refreshToken: string | undefined,
  guildId: string,
): Promise<Claims | 'role'> {
  const { userData, memberData } = identity;
  const required = getServerEnv().VERIFIED_MEMBER_ROLE_ID;
  if (required && !memberData.roles.includes(required)) return 'role';

  const discordId = String(userData.id);
  const existing = await getAccount(discordId);
  // Only a Discord-verified address may become a login email; another member's address is never taken over.
  const candidate =
    typeof userData.email === 'string' && userData.verified === true ? userData.email.trim().toLowerCase() : undefined;
  const email = candidate && (await claimEmail(discordId, candidate)) ? candidate : existing?.email;
  const emailChanged = Boolean(existing?.email && email && existing.email !== email);

  await saveAccount({
    discordId,
    email,
    // A changed Discord email invalidates the old email/password pair; the member sets a new password.
    passwordHash: emailChanged ? undefined : existing?.passwordHash,
    refreshToken: refreshToken ? sealSecret(refreshToken) : existing?.refreshToken,
    createdAt: existing?.createdAt ?? Date.now(),
  });
  const hasPassword = Boolean(existing?.passwordHash) && !emailChanged;

  return {
    discordId,
    username: clean(userData.username, 100),
    globalName: clean(userData.global_name, 100),
    avatar: typeof userData.avatar === 'string' && /^(a_)?[a-f0-9]{32}$/.test(userData.avatar) ? userData.avatar : null,
    guildId,
    roleIds: memberData.roles.slice(0, 250),
    email,
    needsPassword: Boolean(email) && !hasPassword,
  };
}

function toUser(claims: Claims): DashboardUser {
  const ign = navIdentity({
    user: { id: claims.discordId, username: claims.username, global_name: claims.globalName },
  }).ign;
  return {
    id: claims.discordId,
    name: ign,
    image: discordAvatarUrl(claims.discordId, claims.avatar),
    dashboard: claims,
  };
}

function toRecord(token: JWT): DashboardSession {
  return {
    user: {
      id: String(token.discordId),
      username: token.username,
      global_name: token.globalName,
      avatar: token.avatar ?? null,
    },
    guildId: String(token.guildId),
    roleIds: token.roleIds ?? [],
    linkedPlayerId: token.linkedPlayerId,
    linkedPlayerName: token.linkedPlayerName,
    email: token.email ?? undefined,
    needsPassword: token.needsPassword,
    verifiedAt: token.verifiedAt,
    authenticatedAt: token.authenticatedAt,
    expiresAt: token.expiresAt ?? Date.now() + sessionTtlSeconds() * 1000,
  };
}

function toToken(sid: string, record: DashboardSession): JWT {
  const identity = navIdentity(record);
  return {
    sid,
    sub: record.user.id,
    discordId: record.user.id,
    username: record.user.username,
    globalName: record.user.global_name,
    avatar: record.user.avatar ?? null,
    guildId: record.guildId,
    roleIds: record.roleIds,
    linkedPlayerId: record.linkedPlayerId,
    linkedPlayerName: record.linkedPlayerName,
    // Not in `name`/`email`/`picture` of the public session JSON: see the session callback.
    email: record.email,
    needsPassword: record.needsPassword ?? false,
    verifiedAt: record.verifiedAt,
    authenticatedAt: record.authenticatedAt,
    expiresAt: record.expiresAt,
    ign: identity.ign,
    picture: identity.avatarUrl,
  };
}

function discordConfig() {
  const env = requireServerEnv('DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'DISCORD_GUILD_ID');
  return { clientId: env.DISCORD_CLIENT_ID!, clientSecret: env.DISCORD_CLIENT_SECRET!, guildId: env.DISCORD_GUILD_ID! };
}

// Dev note: Auth.js wants one canonical origin; APP_URL is the only origin this house recognises.
const canonicalOrigin = getServerEnv().APP_URL;
// Development trusts the request host instead, so the OAuth redirect_uri is identical at authorize and token time
// even when APP_URL points at a public domain while you browse localhost.
if (process.env.NODE_ENV === 'production' && canonicalOrigin) process.env.AUTH_URL = new URL(canonicalOrigin).origin;

const config = (): NextAuthConfig => {
  const env = getServerEnv();
  const production = env.NODE_ENV === 'production';
  const clientId = env.DISCORD_CLIENT_ID ?? '';
  const clientSecret = env.DISCORD_CLIENT_SECRET ?? '';

  return {
    secret: env.AUTH_SECRET,
    // AUTH_URL replaces the request origin with APP_URL in production; Auth.js still requires explicit host trust.
    trustHost: true,
    useSecureCookies: production,
    pages: { signIn: '/login', error: '/login' },
    session: { strategy: 'jwt', maxAge: sessionTtlSeconds() },
    cookies: {
      sessionToken: {
        name: SESSION_COOKIE,
        options: { httpOnly: true, sameSite: 'lax', path: '/', secure: production },
      },
    },
    jwt: {
      maxAge: sessionTtlSeconds(),
      async encode({ token }) {
        if (!token) return '';
        // Auth.js re-encodes the token on every session read to slide the cookie. Such a write-back belongs to a
        // session that already exists: it must never recreate one that was signed out or revoked in the meantime.
        if (typeof token.sid === 'string') {
          await saveSession(token.sid, toRecord(token), { onlyIfExists: true });
          return token.sid;
        }
        const sid = randomBytes(32).toString('hex');
        await saveSession(sid, toRecord(token));
        return sid;
      },
      async decode({ token }) {
        if (!token) return null;
        const record = await getSession(token);
        return record ? toToken(token, record) : null;
      },
    },
    providers: [
      Discord({
        clientId,
        clientSecret,
        // Discord now sends `iss=https://discord.com` on the callback (RFC 9207); Auth.js defaults to authjs.dev and rejects it.
        issuer: 'https://discord.com',
        authorization: { params: { scope: 'identify email guilds.members.read' } },
        async profile(_profile, tokens): Promise<DashboardUser> {
          try {
            const config = discordConfig();
            const identity = await readDiscordIdentity(String(tokens.access_token ?? ''), config.guildId);
            const claims = await claimsFromDiscord(identity, tokens.refresh_token, config.guildId);
            if (claims === 'role') {
              void recordAudit({
                event: 'auth.login_failed',
                outcome: 'denied',
                data: { method: 'discord', reason: 'role_missing' },
              });
              return { id: String(identity.userData.id), denied: 'role' };
            }
            return toUser(claims);
          } catch (error) {
            logger.warn('Discord sign-in could not be verified', { reason: error instanceof Error ? error.name : '' });
            const code = (error as { code?: string }).code;
            return { id: 'denied', denied: code === 'GUILD_REQUIRED' ? 'guild' : 'unavailable' };
          }
        },
      }),
      Credentials({
        credentials: { email: {}, password: {} },
        async authorize(credentials, request): Promise<DashboardUser | null> {
          const parsed = loginSchema.safeParse(credentials);
          if (!parsed.success) return null;
          const { email, password } = parsed.data;
          const address = getClientAddress({
            headers: { 'x-forwarded-for': request.headers.get('x-forwarded-for') ?? undefined },
          });
          const deny = (reason: string) => {
            logger.warn('Password sign-in refused', { reason });
            // The email is deliberately not recorded; the network address and reason are enough to spot guessing.
            void recordAudit({
              event: 'auth.login_failed',
              outcome: 'failure',
              ip: address,
              data: { method: 'password', reason },
            });
            return null;
          };
          if (!(await checkPasswordLoginLimits(address, email))) return deny('rate_limited');

          const account = await getAccountByEmail(email);
          const linked = account?.email === email ? account : null;
          // Always run the hash so unknown emails cost the same as wrong passwords.
          const passwordOk = await verifyPassword(password, linked?.passwordHash);
          if (!linked) return deny('no_account_for_email');
          if (!passwordOk) return deny('wrong_or_unset_password');

          // Roles come from Discord on every password login: leaving the guild ends email access too.
          const refreshToken = linked.refreshToken ? openSecret(linked.refreshToken) : null;
          if (!refreshToken) return deny('refresh_token_unreadable');
          try {
            const config = discordConfig();
            const identity = await refreshDiscordIdentity(refreshToken, config);
            if (identity.userData.id !== linked.discordId) return deny('discord_id_mismatch');
            const claims = await claimsFromDiscord(identity, identity.refreshToken, config.guildId);
            return claims === 'role' ? deny('role_missing') : toUser(claims);
          } catch (error) {
            return deny(`discord_reverify_failed:${(error as { code?: string }).code ?? 'unknown'}`);
          }
        },
      }),
    ],
    callbacks: {
      signIn({ user }) {
        const denied = (user as DashboardUser).denied;
        if (denied) return `/login?error=${denied}`;
        return Boolean((user as DashboardUser).dashboard);
      },
      jwt({ token, user }) {
        const dashboard = (user as DashboardUser | undefined)?.dashboard;
        if (!dashboard) return token;
        void recordAudit({ event: 'auth.login', outcome: 'success', actor: dashboard.discordId });
        // A fresh login never inherits a session id (no session fixation) and gets a full 30 days.
        return {
          sub: dashboard.discordId,
          discordId: dashboard.discordId,
          username: dashboard.username,
          globalName: dashboard.globalName,
          avatar: dashboard.avatar,
          guildId: dashboard.guildId,
          roleIds: dashboard.roleIds,
          email: dashboard.email,
          needsPassword: dashboard.needsPassword,
          // Both providers just read the member's guild roles from Discord, so this login is the verification.
          verifiedAt: Date.now(),
          authenticatedAt: Date.now(),
          expiresAt: Date.now() + sessionTtlSeconds() * 1000,
        };
      },
      session({ session, token }) {
        // Only display data crosses to the client: no roles, no email, no session id.
        session.user = {
          id: token.discordId ?? '',
          name: token.ign ?? null,
          image: token.picture ?? null,
          ign: token.ign ?? '',
          needsPassword: Boolean(token.needsPassword),
        } as typeof session.user;
        return session;
      },
    },
    events: {
      async signOut(message) {
        const sid = 'token' in message ? message.token?.sid : undefined;
        if (typeof sid === 'string') await deleteSession(sid);
        void recordAudit({
          event: 'auth.logout',
          outcome: 'success',
          actor:
            'token' in message && typeof message.token?.discordId === 'string' ? message.token.discordId : undefined,
        });
      },
    },
  };
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
