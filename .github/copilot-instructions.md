# GitHub Copilot — Arrakis Control Dashboard

Read and follow repository-root `AGENTS.md` before making changes. It is the authoritative project contract. Also consult `docs/architecture/file-organization.md` for placement and `docs/architecture/repository-inventory.md` for historical context. Do not edit the Next.js-managed section of `AGENTS.md`.

## Stack and ownership
- Node.js 22+, Next.js 16, React 19, TypeScript, Tailwind CSS v4, npm, Redis standalone/Cluster, Vitest, Playwright.
- Redis is the **only persistent store**; do not introduce PostgreSQL.
- Keep `src/app/` and `src/pages/api/` as thin framework/API entry points; feature logic belongs in `src/features/<domain>/`.
- Shared UI belongs in `src/components/`, request infrastructure in `src/server/`, focused shared utilities in `src/lib/`, canonical environment validation in `src/config/env.ts`.
- Do not restore retired `src/modules/`, `src/infrastructure/`, or `public/` directories.

## Security and quality
- Preserve server-side authorization, session freshness, CSP nonce, origin checks, bounded payloads, safe errors, and redacted logging.
- Never read, print, commit, or expose production secrets. `.env.example` is the sanitized public template.
- Respect server/browser import boundaries, Redis Cluster compatibility, and no-retry constraints on sensitive Console writes.
- Follow existing formatting, naming, design tokens, accessibility and reduced-motion behavior.
- Keep changes scoped, preserve uncommitted work, and ask before destructive Git, migrations, deployments, or production operations.

## Verification
- Discover available package scripts; normally run `npm run format:check`, `npm run typecheck`, `npm run lint`, `npm test`.
- For runtime/API changes also run `npm run build` and `npm run test:production`; for UI changes use focused Playwright and relevant browser tests.
- Historical inventory recorded browser failures: rerun before calling them pre-existing. Never claim tests passed without running them.
- Report changes, tests, documentation, security implications and unverified items clearly.

Use `.github/instructions/*.instructions.md` for path-specific rules. If any instructions conflict, `AGENTS.md` and live repository code are authoritative; surface the conflict.
