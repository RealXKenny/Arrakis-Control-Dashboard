# Supported and future AI coding assistants

`AGENTS.md` is the canonical cross-agent contract. All agent-specific files are thin adapters, not independent sources of truth.

| Tool | Project instruction file |
|---|---|
| Claude Code | `CLAUDE.md`, `.claude/rules/`, `.claude/settings.json` |
| Kimi Code | `AGENTS.md` (and optional `KIMI.md`) |
| OpenAI Codex | `AGENTS.md`, `.codex/config.toml` |
| GitHub Copilot | `.github/copilot-instructions.md`, `.github/instructions/` |
| Cursor | `.cursor/rules/arrakis.mdc` |
| Gemini CLI | `GEMINI.md` |
| Windsurf | `.windsurf/rules/arrakis.md` |
| Cline | `.clinerules/01-arrakis.md` |
| Roo Code | `.roo/rules/01-arrakis.md` |
| Continue | `.continue/rules/arrakis.md` |
| Aider | `CONVENTIONS.md` (pass explicitly with `--read CONVENTIONS.md`) |
| OpenCode and other AGENTS.md-aware tools | `AGENTS.md` |

Tool support and instruction discovery change by version. Confirm which files each installed tool actually reads; do not assume every tool reads every file. For tools without confirmed native support, manually attach `AGENTS.md`.

The folder-icon screenshot is an icon catalog, not a list of installed AI assistants. The package targets recognizable coding assistants and a generic fallback rather than treating every icon label as an AI product.

## Maintenance
1. Edit `AGENTS.md` first when architectural rules change.
2. Keep adapters brief and pointing back to it.
3. Check agent-specific format and behavior after upgrading each tool.
4. Never add conflicting instructions or tool permission bypasses.
