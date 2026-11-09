# Glossary

| Term                 | Meaning                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Adapter              | The RedBlink Console's built-in, disabled-by-default Discord adapter (`/api/integrations/discord/*`), called with `ADAPTER_TOKEN` |
| Administrator        | A member whose Discord ID is in `ADMIN_DISCORD_IDS` (and who is in the guild with the role)                                       |
| AUDIT line           | A readable stdout entry carrying a security event and its correlation ID                                                          |
| Battlegroup          | RedBlink/Dune term for one game server deployment identity                                                                        |
| Catalog              | `src/features/admin/catalog.json`: the allowlist of 383 administrator operations                                                  |
| Console              | The RedBlink Dune Docker web UI and HTTP API (default port 8088)                                                                  |
| Egg                  | A Pterodactyl server template (JSON); this project generates one per release                                                      |
| Fail closed          | On error, deny (production config, rate limiter) rather than allow                                                                |
| Guild leader         | A member whose linked character has role `100` in the Console's guild roster                                                      |
| Hash tag             | The `{…}` part of a Redis key that decides its Cluster slot (`{guilds}`, `{bm}`, `{audit}`)                                       |
| High-risk operation  | An administrator operation needing a sign-in within `ADMIN_HIGH_RISK_REAUTH_MINUTES`                                              |
| Linked character     | The in-game character linked to a Discord account through the adapter                                                             |
| Owner key            | Opaque HMAC identifying a marketplace listing's owner (`OWNER_KEY_SECRET`)                                                        |
| Pawn / controller ID | In-game identifiers of a player character, both accepted when matching a leader                                                   |
| RedBlink             | The upstream project (Red-Blink/dune-awakening-selfhost-docker) that hosts the Dune server and Console                            |
| Session              | A server-side Redis record; the browser keeps only an opaque ID in an httpOnly cookie                                             |
| Step-up              | Requirement for a recent interactive sign-in before administrator changes                                                         |
| Trusted proxy count  | `TRUSTED_PROXY_COUNT`: how many proxies' `X-Forwarded-For` entries the app trusts                                                 |
| Verified role        | The Discord role `VERIFIED_MEMBER_ROLE_ID` required for access                                                                    |
