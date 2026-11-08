# Kimi Code — Arrakis Control Dashboard

## Start here
Read `AGENTS.md` in full before making changes. It is the canonical engineering and architecture contract. Read `docs/architecture/file-organization.md` before creating or moving files and consult `docs/architecture/repository-inventory.md` for ownership. Check the live repository; inventory snapshots can become stale.

## Working rules
- Inspect `git status`, the current branch, package scripts, and relevant source/tests first.
- Preserve existing changes. Never reset, clean, merge, commit, push, or deploy without explicit approval.
- Keep routes thin, business logic under `src/features/`, shared UI under `src/components/`, and shared infrastructure under `src/server/` or `src/lib/`.
- Redis is the sole persistent store; support standalone and Cluster. Do not introduce PostgreSQL.
- Follow Next.js 16's locally installed `node_modules/next/dist/docs/` before changing framework behavior. Never modify the Next.js-managed section of `AGENTS.md`.
- Preserve server-side authorization, CSP, secrets handling, bounded inputs, safe errors, and all security contracts in `AGENTS.md`.
- For substantial changes, make a concise plan, implement focused changes, update relevant tests/docs, and review the final diff.
- Standard checks: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`. For runtime/API changes add `npm run build` and `npm run test:production`; for UI changes run appropriate Playwright checks.
- Never claim verification unless executed. Distinguish historical browser failures from newly observed regressions.
- End with summary, changed files, checks/results, documentation, risks, and Git status.

## Compatibility
This is a human-readable Kimi-specific companion, not a claim that Kimi automatically discovers `KIMI.md`. Paste its contents into Kimi Code's project instructions if needed. `AGENTS.md` remains the authoritative shared file.
