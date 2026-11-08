# Coding assistant setup

This repository already includes its assistant configuration. Start with [AGENTS.md](../../AGENTS.md), the canonical shared contract, and [file organization](../architecture/file-organization.md). The [integration catalog](README.md) lists native discovery paths; verify loaded instructions in each installed tool rather than assuming universal import support.

## Configure and verify

1. Review the native settings for the assistant you use. Claude settings are in `.claude/settings.json`; Codex settings are in `.codex/config.toml`. Global settings and trust policies can override project settings. Do not bypass permission checks.
2. In Claude Code, use `claude doctor`, `/status`, and `/model` to inspect the installed configuration. Select only a model offered by your installation. In Codex, verify the active sandbox and approval settings.
3. For tools without confirmed native instruction discovery, explicitly attach `AGENTS.md`. For Aider, pass `--read docs/ai/guides/CONVENTIONS.md`. Root `CODEX.md` and `KIMI.md` are optional companion references, not promises of automatic discovery.
4. Run `npm run ai:check`, then the applicable standard checks. The validator checks repository files and supported static structure; it cannot verify installed assistant behavior or sandbox enforcement.
5. Review Git diffs before using new settings. Instructions do not replace isolation, code review, or authorization for Git writes and production operations.

## Importing configuration from an archive

Extract to a temporary folder first. Compare and merge existing files; never overwrite newer instructions or user work. Preserve the live Next.js-managed block in `AGENTS.md` verbatim. Merge `.github/` so CI and release workflows remain intact. Review each optional adapter and permission setting individually.

New root instruction entry points need a documented reason in the repository inventory and an explicit architecture allowlist update. Run AI validation and architecture checks after merging. Consult [browser test triage](browser-test-triage.md) for newly observed failures; historical results are not a current baseline.
