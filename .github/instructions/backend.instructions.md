---
applyTo: "src/app/api/**/*.ts,src/pages/api/**/*.ts,src/server/**/*.ts,src/features/**/server/**/*.ts,src/lib/redis/**/*.ts,src/config/**/*.ts"
---

# Backend instructions
- Route handlers delegate to feature-owned handlers; use `src/server/http.ts` for V2 and `runPagesApiHandler` for legacy Pages API where applicable.
- Validate untrusted input as `unknown`, bound bodies and provider responses, preserve no-store and safe errors.
- Redis is the only persistent store. Preserve standalone and Cluster support, key expiry and atomic behavior.
- Keep Console API keys, adapter tokens and bot tokens distinct; do not restore deprecated Console password/cookie auth.
- Never authorize writes using client-supplied identities or stale Discord/guild role data.
