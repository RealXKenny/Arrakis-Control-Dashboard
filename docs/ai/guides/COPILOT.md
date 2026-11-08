# GitHub Copilot integration

GitHub Copilot's repository-wide instructions are in `.github/copilot-instructions.md`. Path-specific guidance is in `.github/instructions/*.instructions.md` with `applyTo` frontmatter. `AGENTS.md` remains the shared project source of truth.

For supported Copilot environments, enable repository and path-specific custom instructions. Actual instruction loading depends on your IDE, Copilot product and configuration; verify that instructions are used. `COPILOT.md` is an explanatory companion, not an automatically loaded instruction file.

Review the current repo and protect any newer Next.js-managed `AGENTS.md` block before copying files. Never treat AI instructions as a substitute for Git reviews, CI, permissions or a secure sandbox.
