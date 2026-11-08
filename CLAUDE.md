# Arrakis Control Dashboard — Claude Code

Read `AGENTS.md` first. It is the authoritative project contract, including the **Next.js-generated managed block**. Do not modify or duplicate that managed block. Also read `docs/architecture/file-organization.md` and consult `docs/architecture/repository-inventory.md` before structural changes.

## Project
Node.js 22+, Next.js 16, React 19, TypeScript, Tailwind v4, npm, Redis standalone/Cluster, Vitest and Playwright. Redis is the **only persistent database**. Never introduce PostgreSQL as a presumed dependency.

## Working method
1. Inspect `git status`, relevant files, `AGENTS.md`, and actual package scripts.
2. Keep changes scoped and preserve unrelated work. Never reset or clean without approval.
3. Put feature logic under `src/features/<domain>/`; keep route handlers thin.
4. Maintain server/browser import boundaries and existing security controls.
5. Add focused regression coverage; run applicable checks and accurately report failures.
6. Update docs, architecture inventory, and changelog only when relevant.
7. Never commit, merge, push, rebase, or deploy without explicit approval.

## Source of truth
If this file or `.claude/rules/` disagrees with `AGENTS.md`, follow `AGENTS.md` and report the conflict. Never assume a historical inventory is current; inspect the working tree.

## Verification
Standard: `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.
Runtime/API: additionally `npm run build`, `npm run test:production`.
Browser/UI: `npm run test:browser` or focused Playwright tests.
Real Redis integration is opt-in: `npm run test:integration` with test-only Redis configuration.
Do not claim successful live-service verification without running it.

## Response format
Summarize changes, affected files, tests run and outcomes, security considerations, documentation updates, and any unverified items. Distinguish pre-existing failures from new regressions.
