# Secrets management

## Inventory

| Secret                  | Generate with                                  | Where it lives                          | If leaked                                                                      |
| ----------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------ |
| `AUTH_SECRET`           | `openssl rand -base64 48`                      | Environment only                        | Rotate; everyone signs in again                                                |
| `OWNER_KEY_SECRET`      | `openssl rand -base64 48`                      | Environment only                        | Attackers can compute owner keys for any Discord ID; rotate with the migration |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal                       | Environment only                        | Reset in the portal                                                            |
| `CONSOLE_API_KEY`       | Console Settings → API Keys                    | Environment only                        | Delete the key in the Console, create a new one                                |
| `ADMIN_CONSOLE_API_KEY` | Console Settings → API Keys                    | Environment only                        | As above; treat as full administrator access within its scopes                 |
| `ADAPTER_TOKEN`         | `openssl rand -base64 36` (Console token file) | Console token file and environment      | Replace both sides                                                             |
| `BOT_API_TOKEN`         | `openssl rand -base64 48` (32 to 256 chars)    | Environment and your bot's secret store | Replace both                                                                   |
| Redis password          | `openssl rand -base64 36`                      | `REDIS_URL` and Redis config            | Change both                                                                    |
| `DISCORD_BOT_TOKEN`     | Main Discord bot                               | Environment only                        | Reset the bot token in the Discord Developer Portal                            |
| Re-key backup file      | `--backup <file>`                              | A private location                      | Contains listing data; treat as sensitive                                      |

## Rules

1. **Never** commit `.env`; never put secrets in `NEXT_PUBLIC_` variables, issues, chat or screenshots. `.env` is git-ignored.
2. Distinct values everywhere. Reuse turns one leak into many.
3. Generate with a CSPRNG; the app enforces only minimum lengths.
4. Production values are not copied into development or test environments.
5. Logs and error bodies redact secrets; do not undo that with ad-hoc debug printing.

## Storage options

| Platform    | Practice                                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| systemd     | `EnvironmentFile=` owned by root, mode `0640`, group = service group                                                                                          |
| Pterodactyl | Panel variables; the egg hides credentials from owners/subusers, but panel administrators and anyone with file, process or console access can still read them |
| Windows     | Machine-level environment variables or a locked-down `.env`; restrict NTFS permissions to the service account                                                 |

## Rotation

See [maintenance](../administration/maintenance.md#rotating-secrets) for the effect of each rotation and [incident response](incident-response.md) for leaks.
