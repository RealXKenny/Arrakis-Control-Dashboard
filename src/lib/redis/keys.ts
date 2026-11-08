import '../assert-server';

/**
 * Redis key schema for every module that runs multi-key Lua scripts.
 *
 * Redis Cluster only runs a script when all its keys share one hash slot, and the slot comes from
 * the `{hash tag}` in the key name. Each family below shares a tag so its scripts are cluster-safe:
 *  - `{guilds}`: all guild recruitment, chat and support data (scripts also touch two global indexes,
 *    so the whole domain lives in one slot; guild data is small and low-traffic).
 *  - `{solido:<owner>}`: one member's base-import ledger, so load spreads across slots per member.
 *  - `{bm}`: base marketplace listings, previews, and the V2 store.
 *
 * Single-key data (sessions, rate limits, caches) needs no tag. Keep `rekey-rules.mjs` in step with
 * this file: a test asserts every old name maps to exactly the builder here.
 */

export const GUILD_TAG = '{guilds}';

export const guildKeys = {
  applications: (guildId: string) => `arrakis:${GUILD_TAG}:applications:${guildId}`,
  applicationsIndex: (guildId: string) => `arrakis:${GUILD_TAG}:applications-index:${guildId}`,
  requirements: (guildId: string) => `arrakis:${GUILD_TAG}:requirements:${guildId}`,
  /** Global, ordered index of published recruitment listings. */
  requirementsIndex: `arrakis:${GUILD_TAG}:requirements-index`,
  logo: (guildId: string) => `arrakis:${GUILD_TAG}:logo:${guildId}`,
  support: (guildId: string) => `arrakis:${GUILD_TAG}:support:${guildId}`,
  /** Global, ordered index of conversations with unread admin messages. */
  supportUnread: `arrakis:${GUILD_TAG}:support-unread`,
  /** Scripts append `<application>:<generation>` (and `:seen`) to this prefix, so it must carry the tag. */
  chatPrefix: (guildId: string) => `arrakis:${GUILD_TAG}:chat:${guildId}:`,
  chat: (guildId: string, applicationId: string, generation: string | number) =>
    `arrakis:${GUILD_TAG}:chat:${guildId}:${applicationId}:${generation}`,
  reviewLock: (guildId: string, applicationId: string) =>
    `arrakis:${GUILD_TAG}:application-review:${guildId}:${applicationId}`,
};

export const solidoKeys = {
  /** Per-member daily import ledger. */
  history: (owner: string, day: string) => `arrakis:{solido:${owner}}:history:${day}`,
  operation: (owner: string, operationId: string) => `arrakis:{solido:${owner}}:operation:${operationId}`,
};

/** Security audit trail: one bounded sorted set (see lib/security/audit.ts). */
export const auditKeys = {
  events: 'arrakis:{audit}:v1:events',
};

export const BASE_MARKETPLACE_TAG = '{bm}';

/** Legacy (V1) marketplace and preview storage. The V2 store lives under `arrakis:{bm}:v2:`. */
export const baseKeys = {
  preview: (id: string) => `arrakis:${BASE_MARKETPLACE_TAG}:preview:${id}`,
  listing: (id: string) => `arrakis:${BASE_MARKETPLACE_TAG}:v1:listing:${id}`,
  summaryState: (id: string) => `arrakis:${BASE_MARKETPLACE_TAG}:v1:summary-state:${id}`,
  listings: `arrakis:${BASE_MARKETPLACE_TAG}:v1:listings`,
};
