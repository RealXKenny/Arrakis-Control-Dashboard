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

/** A single bounded hash contains community events and their one-time seed marker. */
export const communityEventKeys = { records: 'arrakis:{community-events}:records' };

export const guildKeys = {
  operations: (guildId: string) => `arrakis:${GUILD_TAG}:operations:${guildId}`,
  noticeboard: (guildId: string) => `arrakis:${GUILD_TAG}:noticeboard:${guildId}`,
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

export const chatKeys = {
  messages: (serverId: string) => `arrakis:{chat:${serverId}}:messages`,
  event: (serverId: string, eventHash: string) => `arrakis:{chat:${serverId}}:event:${eventHash}`,
  /** Current delivery state of one dashboard-sent message; Stream entries are immutable. */
  delivery: (serverId: string, messageId: string) => `arrakis:{chat:${serverId}}:delivery:${messageId}`,
  live: (serverId: string) => `arrakis:chat:live:${serverId}`,
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

/** Bounded Discord image cache; the payloads and eviction index share a Cluster slot. */
export const discordAvatarKeys = {
  images: 'arrakis:{avatars}:v1:images',
  access: 'arrakis:{avatars}:v1:access',
};

export const BASE_MARKETPLACE_TAG = '{bm}';

/** Legacy (V1) marketplace and preview storage. The V2 store lives under `arrakis:{bm}:v2:`. */
export const baseKeys = {
  preview: (id: string) => `arrakis:${BASE_MARKETPLACE_TAG}:preview:${id}`,
  listing: (id: string) => `arrakis:${BASE_MARKETPLACE_TAG}:v1:listing:${id}`,
  summaryState: (id: string) => `arrakis:${BASE_MARKETPLACE_TAG}:v1:summary-state:${id}`,
  listings: `arrakis:${BASE_MARKETPLACE_TAG}:v1:listings`,
};

/**
 * Solaris Exchange wallet: one hash tag per owner and server so each ledger script is single-slot.
 * `owner` and `server` must already be validated by `casinoAccountKeys`' callers (see wallet store).
 */
export const casinoKeys = {
  account: (owner: string, server: string, currency: string) =>
    `arrakis:{casino:${owner}:${server}}:${currency}:account`,
  entries: (owner: string, server: string, currency: string) =>
    `arrakis:{casino:${owner}:${server}}:${currency}:entries`,
  idempotency: (owner: string, server: string, currency: string) =>
    `arrakis:{casino:${owner}:${server}}:${currency}:keys`,
  holds: (owner: string, server: string, currency: string) => `arrakis:{casino:${owner}:${server}}:${currency}:holds`,
};

export const casinoTransferKeys = {
  intent: (owner: string, server: string, id: string) => `arrakis:{casino:${owner}:${server}}:transfer:${id}`,
  /** Newest-first ids of one account's transfers, for the wallet history. */
  index: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:transfers`,
  /** Global set of non-terminal intents (`owner|server|id`, scored by last update) for recovery and admin review. */
  open: 'arrakis:{casino-admin}:transfers-open',
};

export const casinoRoundKeys = {
  round: (owner: string, server: string, id: string) => `arrakis:{casino:${owner}:${server}}:round:${id}`,
  /** Newest-first round ids of one account, for game history. */
  index: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:rounds`,
  /** Global set of non-terminal rounds (`owner|server|id`) for the recovery sweep. */
  open: 'arrakis:{casino-admin}:rounds-open',
  seeds: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:seeds`,
  seedsOpen: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:seeds-open`,
  seedsAlloc: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:seeds-alloc`,
  seedsRevealed: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:seeds-revealed`,
  /** Voluntary account restrictions (pause until a time). */
  limits: (owner: string, server: string) => `arrakis:{casino:${owner}:${server}}:limits`,
};
