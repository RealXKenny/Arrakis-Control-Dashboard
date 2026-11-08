# Safe installation

1. Extract the archive to a temporary folder and compare `AGENTS.md` with your current repository copy. **Do not overwrite newer live instructions.** Preserve the generated Next.js managed block verbatim.
2. Merge `.github/` rather than replacing it; existing CI and release workflows must remain intact.
3. Copy the new `docs/ai/`, `.github/instructions/`, and `scripts/maintenance/validate-ai-config.mjs` files. Review optional agent adapters individually.
4. Your architecture tests enforce a root allowlist. Before adding `CLAUDE.md`, `GEMINI.md` or other root agent entrypoints, explicitly update `docs/architecture/file-organization.md`, the root allowlist and related tests. Do not disable the check.
5. Review `.claude/settings.json` and `.codex/config.toml` for compatibility with installed tool versions. Permission rules are not a security boundary. Verify Claude's exact desired Sonnet model using `/model`.
6. Run `node scripts/maintenance/validate-ai-config.mjs`, then `npm run format:check`, `npm run typecheck`, `npm run lint`, and `npm test`. Run build/production smoke or browser suites for relevant changes.
7. Review `git status` and `git diff`; stage only intended changes. Do not commit secrets, caches or generated files.

## Deliberate exclusions

This archive does not edit your actual application code, does not claim to resolve existing browser failures, and does not update your current root allowlist automatically because the actual live architecture test and guide have not been supplied. Follow the included triage and integration steps.
