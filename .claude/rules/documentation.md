# Documentation and releases
- `README.md` is the entry point; put detailed operational guides in `docs/`.
- `docs/architecture/file-organization.md` governs placement; `docs/architecture/repository-inventory.md` documents structure and migrations.
- Cover prerequisites, setup, env variables, Discord OAuth, Dune Console, Redis standalone/Cluster, deployment, Pterodactyl egg, backup, upgrades, security and troubleshooting as applicable.
- Do not invent functionality, URLs, screenshots, commands, or configuration defaults.
- If external RedBlink/Dune Docker material is supplied, verify relevance, preserve licensing/attribution and avoid wholesale copying.
- Releases: keep `package.json` and `package-lock.json` synchronized; update `CHANGELOG.md` with `## Patch Notes vX.Y.Z` for a stable release.
- CI on `main` handles release tags and the Pterodactyl egg artifact; do not invent a Docker/GHCR publication flow.
- Preserve `LICENSE`, notices, third-party asset attribution and existing legal obligations.
