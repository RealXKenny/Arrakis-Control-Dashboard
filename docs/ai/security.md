# Security expectations

Require fresh server-side authentication and authorization for protected operations. Preserve nonce CSP, same-origin mutation checks, no-store responses, bounded inputs, output sanitization, audit logging and secret redaction. Keep Console, adapter, admin Console, and bot tokens distinct. Never print `.env`, rotate credentials, run production Redis rekeys or deploy without explicit authorization. Git and shell allow/deny instructions are not a substitute for operating-system isolation and review.
