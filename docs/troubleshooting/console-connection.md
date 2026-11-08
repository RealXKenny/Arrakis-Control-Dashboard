# Console connection problems

Background: [Dune Console](../configuration/dune-console.md), [RedBlink integration](../integrations/redblink-dune-docker.md).

## Step 1: can the dashboard host reach the Console?

```bash
curl -sS -m 10 -o /dev/null -w "%{http_code}\n" "$CONSOLE_URL/api/health"
```

PowerShell: `Invoke-WebRequest "$env:CONSOLE_URL/api/health" -UseBasicParsing | Select-Object StatusCode`.

| Result                          | Meaning / next step                                                                                  |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Timeout / connection refused    | Wrong host or port, firewall, Console container down (`dune status` on the game host), or `ADMIN_ALLOWED_IPS` excludes the dashboard host |
| TLS error                       | Certificate not trusted by Node (self-signed front door): use a CA-signed certificate; the dashboard has no pinning option |
| 200                             | Reachable; continue                                                                                   |

## Step 2: are the credentials accepted?

```bash
curl -sS -H "Authorization: Bearer $CONSOLE_API_KEY" "$CONSOLE_URL/api/players?page=1&pageSize=1"
curl -sS -H "Authorization: Bearer $ADAPTER_TOKEN"   "$CONSOLE_URL/api/integrations/discord/health"
```

| Response                | Cause and fix                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| `401`                   | Key/token wrong, disabled or expired (a bad bearer never falls back to a cookie). Create a new key; make `ADAPTER_TOKEN` equal the Console's token |
| `403`                   | The key lacks the namespace/action. Edit scopes in Console Settings → API Keys                       |
| Adapter `404`           | Adapter disabled: `DUNE_DISCORD_ADAPTER_ENABLED=true`, rebuild the Console container                  |
| Adapter `503`           | Token missing or the token file is empty/absent                                                       |
| `429`                   | Console rate limit (upstream limits mutations to roughly 20/min per session+IP); slow down            |

## Dashboard symptoms

| Symptom                                       | Cause                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Portal/market/map "unavailable"               | Member key lacks scope or Console unreachable                                                       |
| Character pages empty                          | No Discord↔character link (adapter `players/link` flow), or the adapter is not reachable             |
| `/admin` Overview shows credentials missing    | `ADMIN_CONSOLE_API_KEY` / `ADAPTER_TOKEN` unset (`ADMIN_CONFIG_REQUIRED`)                             |
| Admin requests fail `ADMIN_SECURE_TRANSPORT_REQUIRED` | Remote Console over plain `http`: use HTTPS (loopback `http` is allowed)                     |
| Admin `CONSOLE_OPERATION_RESTRICTED`           | The Console never permits that operation to API keys (setup, database, settings, IAM, key management, addon/update writes) |
| Admin `CONSOLE_OPERATION_FAILED`               | The Console refused or the route does not exist in your Console version                              |
| Slow Console, `SERVER_BUSY`                    | Reads time out after 30 s and retry up to 3 times; check Console health                                |

## Logs

Dashboard log lines: `Provider network failure`, `Console API request failed` (with route and attempt, without credentials). On the game host:
`dune status`, `dune ps`, and the Console's Logs panel.
