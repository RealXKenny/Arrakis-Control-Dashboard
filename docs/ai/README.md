# AI coding agents — Arrakis Control Dashboard

**Canonical contract:** [`../../AGENTS.md`](../../AGENTS.md). Do not maintain duplicate architecture policies in each agent adapter. Existing `AGENTS.md` includes the Next.js-generated managed block; do not edit that block manually.

## Supported integrations

- Claude Code: `CLAUDE.md`, `.claude/settings.json`, `.claude/rules/`
- OpenAI Codex and AGENTS-aware tools: `AGENTS.md`; optional `.codex/config.toml`
- GitHub Copilot: `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`
- Kimi Code: `AGENTS.md` where supported; confirm with your installed release
- Gemini CLI: `GEMINI.md`
- Cursor: `.cursor/rules/arrakis.mdc`
- Windsurf: `.windsurf/rules/arrakis.md`
- Cline: `.clinerules/01-arrakis.md`
- Roo Code: `.roo/rules/01-arrakis.md`
- Continue: `.continue/rules/arrakis.md`
- Aider: explicitly pass `--read docs/ai/guides/CONVENTIONS.md`
- OpenCode: use `AGENTS.md` if supported by the installed version

Agent instruction discovery is version-dependent. Verify the loaded instructions in each agent's UI. These files guide agents; they do **not** sandbox commands or enforce permissions on their own.

## Install and verify

Read [assistant setup](installation.md). Review root-file allowlist and architecture tests before copying new root files. Run `npm run ai:check` after installation, then the standard project checks. Use [the test triage guide](browser-test-triage.md) to investigate existing Playwright failures rather than claiming they are fixed.

## Maintain

Update `AGENTS.md` first. Keep adapters brief and use the [review checklist](review-checklist.md). Add new providers only when there is an actual tool and a documented, supported instruction discovery mechanism.
