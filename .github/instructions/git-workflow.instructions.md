---
applyTo: ".github/workflows/**/*,scripts/deployment/**/*,package.json,package-lock.json"
---

# Git, CI and deployment instructions
- Inspect branch, working tree and diffs before modifying CI or release tooling.
- Do not commit, merge, push, force-push, delete branches, or deploy without explicit approval.
- Keep npm lockfile synchronized, preserve CI/release workflow invariants and Pterodactyl egg generation.
- Validate workflow edits with `npm run workflows:check` and actionlint; keep all required jobs in `CI / Required Checks`.
- Do not invent GHCR publishing or a custom container image; deployment follows the project's existing Node.js/Pterodactyl release path.
- Never stage secrets, generated build outputs, test reports, or unrelated changes.
