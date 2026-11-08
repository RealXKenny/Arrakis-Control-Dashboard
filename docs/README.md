# Arrakis Control Dashboard documentation

Arrakis Control Dashboard v2 is a self-hosted Next.js dashboard for Dune: Awakening communities. This documentation
is written from the repository source, so every setting, command and endpoint named here exists in the code. Where a
topic belongs to another project (for example the RedBlink Dune Docker server stack), the guide says so and links to
the upstream source.

> New here? Read [Introduction](getting-started/introduction.md), then follow the
> [end-to-end RedBlink + dashboard setup](getting-started/end-to-end-redblink-setup.md).

## Start here

| I want to…                                                  | Read                                                                                                         |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Understand what the dashboard is and what it needs          | [Getting started](getting-started/README.md)                                                                 |
| Go from an empty Linux host to a working dashboard          | [End-to-end setup](getting-started/end-to-end-redblink-setup.md)                                             |
| Install it (local, production, Pterodactyl, reverse proxy)  | [Installation](installation/README.md)                                                                       |
| Configure Discord, Redis, the Console and administrators    | [Configuration](configuration/README.md)                                                                     |
| Learn what each screen does                                 | [Features](features/README.md)                                                                               |
| Connect the RedBlink Dune Docker Console, Discord, webhooks | [Integrations](integrations/README.md)                                                                       |
| Run and maintain a live deployment                          | [Administration](administration/README.md)                                                                   |
| Harden and verify a production deployment                   | [Security](security/README.md), [Deployment](deployment/README.md)                                           |
| Call the HTTP APIs                                          | [API reference](api/README.md)                                                                               |
| Work on the code                                            | [Development](development/README.md)                                                                        |
| Fix a problem                                               | [Troubleshooting](troubleshooting/README.md)                                                                 |
| Look something up                                           | [Reference](reference/README.md)                                                                             |

## Sections

- [Getting started](getting-started/README.md): introduction, requirements, quick start, first run, first administrator login, and the end-to-end RedBlink walkthrough.
- [Installation](installation/README.md): local development, production on Linux and Windows, Pterodactyl, reverse proxy (Nginx, Cloudflare), updating.
- [Configuration](configuration/README.md): every environment variable, authentication, Discord OAuth, administrator access, the Console, Redis (standalone and Cluster), logging, rate limiting.
- [Features](features/README.md): dashboard, player pages, administrator panel, guilds and recruitment, marketplace, vehicles, maps, audit logs, sessions.
- [Integrations](integrations/README.md): RedBlink Dune Docker, the Dune Console API, Discord, webhooks.
- [Administration](administration/README.md): administrator setup, sessions, backups and restore, maintenance, monitoring, disaster recovery.
- [Security](security/README.md): overview and known limitations, production hardening, secrets, Redis, release verification, incident response.
- [API reference](api/README.md): authentication, administrator, player, guild, marketplace, server and map endpoints, errors and rate limits.
- [Development](development/README.md): architecture, structure, workflow, testing, debugging.
- [Deployment](deployment/README.md): checklist, GitHub Actions, staging, release, rollback, migration.
- [Troubleshooting](troubleshooting/README.md): symptom-first fixes.
- [Reference](reference/README.md): commands, platforms, configuration examples, glossary, FAQ.

## Existing project documents

These pre-date this documentation set and stay where they are:

- [Architecture: file organization](architecture/file-organization.md) and [repository inventory](architecture/repository-inventory.md): placement rules and the full directory map.
- [AI agent guides](ai/README.md): instructions for coding agents working in this repository.
- [Third-party licenses](legal/THIRD_PARTY_LICENSES.md) and [trademarks](legal/TRADEMARKS.md).
- Root files: [README](../README.md), [CHANGELOG](../CHANGELOG.md), [SECURITY](../SECURITY.md) (how to report a vulnerability), [CONTRIBUTING](../CONTRIBUTING.md), [CODE_OF_CONDUCT](../CODE_OF_CONDUCT.md), [LICENSE](../LICENSE), [NOTICE](../NOTICE.md).

## Conventions

- Linux commands use `bash`; Windows commands use PowerShell. Each block is labelled.
- `<ANGLE_BRACKETS>` mark values you must replace. Never commit real secrets.
- A page that describes behaviour of the RedBlink project says so and links to it; the dashboard never installs, updates or controls that project.
- Run `npm run docs:check` after editing documentation; it verifies relative links.
