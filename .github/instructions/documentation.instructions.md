---
applyTo: "docs/**/*.md,README.md,CHANGELOG.md,.env.example"
---

# Documentation instructions
- Keep `README.md` concise and route detailed setup, deployment, Redis, Discord, Console, security and troubleshooting guides into `docs/`.
- Respect `docs/architecture/file-organization.md` and maintain the repository inventory when structure changes.
- Verify commands and feature claims; avoid fabricated screenshots or placeholders represented as real.
- Preserve RedBlink/upstream attribution and licenses where applicable.
- Run `npm run docs:check` and `npm run docs:format:check` after documentation edits.
- Stable releases synchronize `package.json` and `package-lock.json` and add the correct `CHANGELOG.md` patch notes.
