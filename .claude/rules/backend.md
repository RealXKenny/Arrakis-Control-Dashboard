# Backend and integration contracts
- Keep routes thin and delegate to feature-owned handlers. Use `src/server/http.ts` for V2 API routes.
- Normalize external payloads from `unknown`; bound response sizes, retries, timeouts and data retention.
- Redis is the only persistent store. Maintain standalone/Cluster support, hash-tagged keys, and atomic operations where needed.
- Dune Console uses bearer `CONSOLE_API_KEY`; never restore removed password/cookie-based Console auth.
- Console writes for guild membership are not retried; reverify linked-character leadership immediately before mutation.
- Maintain separate bot read-only authorization using `BOT_API_TOKEN`.
- Preserve marketplace owner verification, image requirements, duplicate delivery safeguards, and explicit rekey migration procedure.
- Keep `src/instrumentation.ts` startup behavior and `scripts/server-launcher.mjs` runtime assumptions intact.
