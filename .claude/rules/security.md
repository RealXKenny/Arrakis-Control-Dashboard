# Security rules
- Preserve per-request nonce CSP in `src/proxy.ts`, same-origin mutation checks, no-store/private headers, bounded inputs, sanitized errors and audit logging.
- Use the established `src/server/http.ts` route wrapper and `runPagesApiHandler` where appropriate.
- Every protected workspace page requires `requireSession()`; admin actions require fresh server-side authorization.
- Preserve Discord OAuth guild-role re-verification and session freshness. Never authorize mutations using cached display names or client claims.
- Never expose `AUTH_SECRET`, `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY`, `ADAPTER_TOKEN`, or `BOT_API_TOKEN`; keep these distinct.
- `.env` is secret; `.env.example` is the sanitized template. Coordinate environment changes with `src/config/env.ts`, tests and documentation.
- Redis is the persistent store; support standalone and Cluster without unsupported SELECT usage.
- Never execute production rekeys, destructive maintenance, credential rotation, or deployments without approval.
- Permission deny patterns are defense in depth, not a shell security boundary.
