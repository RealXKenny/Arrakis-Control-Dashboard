# Production hardening

Work through this list, then the [deployment checklist](../deployment/deployment-checklist.md).

## Configuration

- [ ] `ADMIN_DISCORD_IDS` set explicitly to the smallest list; every ID in the guild with the member role.
- [ ] `AUTH_SECRET` 48+ random characters, unique; `OWNER_KEY_SECRET` set to a separate random value **before** publishing listings you keep.
- [ ] `CONSOLE_API_KEY`, `ADMIN_CONSOLE_API_KEY`, `ADAPTER_TOKEN`, `BOT_API_TOKEN` all different; minimal Console scopes.
- [ ] `APP_URL` is the exact public `https://` origin.
- [ ] `REDIS_URL` uses a password and `rediss://` where traffic leaves the host; `REDIS_REQUIRE_TLS=true`; `REDIS_ALLOW_INSECURE` left `false`.
- [ ] `TRUSTED_PROXY_COUNT` equals the real number of proxies.
- [ ] `ADMIN_REAUTH_HOURS` / `ADMIN_HIGH_RISK_REAUTH_MINUTES` reviewed (defaults 12 / 60).
- [ ] `AUDIT_LOG_STDOUT=true` and the output shipped off the host; `AUDIT_LOG_REDIS=true` for in-app review.
- [ ] `LOG_LEVEL=INFO` (not `DEBUG`) in production.

## Network

<a id="network"></a>

- [ ] Only the reverse proxy is public. The Node port listens on loopback or a private interface.
- [ ] Redis is private; firewall it to the dashboard host(s).
- [ ] The Console port (`8088` by default) is private; reachable from the dashboard host only. If you use the Console's
      `ADMIN_ALLOWED_IPS`, include the dashboard host.
- [ ] TLS terminates at the proxy with a valid certificate; HSTS is sent by the app. Do not cache dashboard or API responses at the edge.
- [ ] Outbound access limited to the Console, Discord, Redis and (for installs) GitHub.

## Host and process

- [ ] Run as an unprivileged user; set the `.env` file to mode `600` (or use root-owned `0640` env files for services).
- [ ] Keep Node.js 22 patched; update the dashboard on a schedule ([updating](../installation/updating.md)).
- [ ] No debug ports, no `NODE_OPTIONS=--inspect`.

## Pterodactyl

- [ ] `RELEASE_TAG` pinned to a version you tested; `ALLOW_UNVERIFIED_RELEASE=false`.
- [ ] Credentials entered by a panel administrator; subuser permissions minimized; node private.

## Verify after deploy

```bash
curl -sI https://dashboard.example.com/ | grep -iE "strict-transport|content-security|x-frame|x-content-type"
curl -s -o /dev/null -w "%{http_code}\n" https://dashboard.example.com/.env              # 404
curl -s -o /dev/null -w "%{http_code}\n" https://dashboard.example.com/api/v2/admin/overview   # 401
```

Cross-origin mutations must be refused (403 `INVALID_ORIGIN`); startup must show no `REDIS_URL carries no password` warning.

## Related

[Security overview](security-overview.md) · [Secrets](secrets-management.md) · [Redis security](redis-security.md) · [Reverse proxy](../installation/reverse-proxy.md)
