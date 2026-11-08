# Reverse proxy, Nginx and Cloudflare

## Overview

Production needs HTTPS in front of the Node.js process. The proxy terminates TLS, forwards to `SERVER_HOSTNAME:SERVER_PORT`,
and tells the app how many proxies sit in front of it through `TRUSTED_PROXY_COUNT`. The app itself sends the security
headers (CSP with a per-request nonce, HSTS in production, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy`), so the proxy does not need to add them and must not weaken them.

## Requirements

- A domain and a TLS certificate (for example from Let's Encrypt).
- `APP_URL` set to the exact public origin, `https://…`, no path, no trailing path segments.
- The dashboard listening on loopback or a private address.

## `TRUSTED_PROXY_COUNT`

Every per-address rate limit uses the client address. Each proxy appends the address it saw to `X-Forwarded-For`; the app
trusts only the entry appended by *its own* proxies and ignores anything the client wrote to the left. Therefore the number
must be exact:

| Topology                                       | `TRUSTED_PROXY_COUNT` |
| ---------------------------------------------- | --------------------- |
| Browser → app directly (no proxy)              | `0`                   |
| Browser → Nginx → app                          | `1` (default)         |
| Browser → Cloudflare → Nginx → app             | `2`                   |
| Browser → load balancer → Nginx → app          | `2`                   |

Too low and every visitor shares the proxy's address (they all fall in one rate-limit bucket); too high and a client can
choose its own address with a forged header. IPv6 clients are limited per `/64` network. Allowed range: 0 to 5.

## Nginx example

An **example** configuration; adapt names, paths and TLS settings:

```nginx
server {
    listen 443 ssl http2;
    server_name dashboard.example.com;

    ssl_certificate     /etc/letsencrypt/live/dashboard.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/dashboard.example.com/privkey.pem;

    client_max_body_size 9m;   # admin uploads are limited to 8 MiB; marketplace uploads to about 2.8 MiB

    location / {
        proxy_pass http://127.0.0.1:2008;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;          # administrator log/task streams are server-sent events
        proxy_read_timeout 130s;      # downloads stream for up to 120 s
    }
}

server {
    listen 80;
    server_name dashboard.example.com;
    return 301 https://$host$request_uri;
}
```

Do not cache dashboard or API responses: the app sends `Cache-Control: no-store`/`private` and
`CDN-Cache-Control: no-store`; keep it that way.

## Cloudflare

- Proxy the DNS record (orange cloud) and use the **Full (strict)** TLS mode with a valid certificate on Nginx.
- Set `TRUSTED_PROXY_COUNT=2` when Cloudflare sits in front of Nginx.
- Do not add a Cloudflare cache rule for the dashboard. Authenticated API responses must never be cached.
- Restrict the origin firewall to Cloudflare's published address ranges if you want to prevent bypassing it; otherwise a
  direct-to-origin request can forge `X-Forwarded-For` entries to the left of the trusted ones (harmless to the limiter,
  but you lose edge protection).
- Large uploads may be limited by your Cloudflare plan's request body limit.

## Verify

```bash
curl -sI https://dashboard.example.com/ | grep -iE "strict-transport|content-security|x-frame|x-content-type"
```

Expected: HSTS, a CSP containing `'nonce-`, `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.

## Security

[Reverse proxy security](../security/production-hardening.md#network) · [Rate limiting](../configuration/rate-limiting.md)

## Troubleshooting

| Symptom                                   | Cause                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| Mutations fail with `INVALID_ORIGIN` (403) | `APP_URL` is not the exact public origin, or the proxy rewrites/strips `Origin`     |
| Everyone gets rate limited together       | `TRUSTED_PROXY_COUNT` is lower than the real proxy count                            |
| Sign-in loops                              | `APP_URL` scheme mismatch (the `__Host-` cookie requires HTTPS)                     |
| Admin log streams stall                    | Proxy buffering on; set `proxy_buffering off`                                        |
