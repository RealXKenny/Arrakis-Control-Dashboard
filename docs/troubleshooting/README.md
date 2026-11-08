# Troubleshooting

Find the symptom, then follow the guide.

| Symptom                                                              | Guide                                               |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| Every page returns HTTP 500 right after (re)starting in production    | [Startup errors](startup-errors.md)                  |
| Discord sign-in is refused, loops, or ends on `/login`                | [Discord login](discord-login.md)                    |
| Portal, market, maps or admin show "unavailable"                      | [Console connection](console-connection.md)          |
| `RATE_LIMIT_UNAVAILABLE`, sessions lost, Redis warnings, Cluster trouble | [Redis errors](redis-errors.md)                   |
| Pterodactyl install fails or the server will not reach "running"      | [Pterodactyl errors](pterodactyl-errors.md)          |
| `npm ci`, `npm run build`, type or lint errors                        | [Build errors](build-errors.md)                      |
| Slow pages, 429/503, anything else                                    | [Common issues](common-issues.md)                    |

Game-server problems (containers, ports, game updates) belong to RedBlink Dune Docker; use `dune status` and the upstream
[troubleshooting guides](https://github.com/Red-Blink/dune-awakening-selfhost-docker), then return to
[Console connection](console-connection.md) to confirm the dashboard sees the fix.

## Collecting information for a report

1. Dashboard version (`/changelog`, `package.json`) and Node version.
2. The log lines around the failure (redact secrets; the app already redacts most).
3. The `requestId` from legacy API error bodies or the `X-Request-ID` header.
4. Relevant audit events ([audit logs](../features/audit-logs.md)).
5. Never include `.env` contents, tokens, cookies or Redis dumps. Security issues: [SECURITY.md](../../SECURITY.md).
