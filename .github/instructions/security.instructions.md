---
applyTo: "src/features/auth/**/*,src/features/admin/**/*,src/lib/security/**/*,src/proxy.ts,src/config/env.ts,.env.example"
---

# Security instructions
- Preserve CSP nonces, origin checks, session and admin re-verification, least privilege, redaction and request bounds.
- Never read or emit real `.env` values or production credentials. Update `.env.example` with sanitized placeholders only.
- Check cross-feature authorization, ownership, data retention, error disclosures and secret leakage for security-sensitive edits.
- No production Redis rekey, credentials rotation, deploy, or destructive changes without explicit approval.
