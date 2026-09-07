# RabbitMQ Live Intel

The portal includes an optional read-only observer and `/portal?view=live`. It does not change the Console fork or game queues. The collector runs in the persistent Next.js Node process, with a Redis leader lease across replicas. It is unsuitable for short-lived serverless functions.

## Same-VPS configuration

Keep RabbitMQ management private. When the portal shares the broker network namespace, management is `http://127.0.0.1:15672` and AMQPS uses port **5672**. In separate containers, localhost is the portal container: use the broker's private Docker hostname for AMQPS, and a private HTTPS management endpoint, or configure shared networking explicitly. Do not expose management or AMQP publicly for this feature.

Configure the portal's server environment, not browser variables:

```dotenv
LIVE_EVENTS_ENABLED=true
RABBITMQ_URL=amqps://OBSERVER_USER:URL_ENCODED_PASSWORD@BROKER_HOST:5672/%2F
RABBITMQ_MANAGEMENT_URL=http://127.0.0.1:15672
RABBITMQ_TLS_SERVERNAME=NAME_ON_BROKER_CERTIFICATE
RABBITMQ_CA_PEM="-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"
LIVE_EVENTS_ADMIN_ROLE_IDS=DISCORD_ADMIN_ROLE_ID
```

Use a dedicated broker observer account with management visibility for the selected vhost and permissions to declare/read its generated exclusive queues and bind allowed exchanges. Do not reuse game accounts or assume the guest password. TLS certificate verification is always enabled. A trusted public certificate needs no custom CA. Existing Upstash REST Redis configuration is also required; this is not a native Redis TCP URL.

Restart the portal after configuration. Sign in again after changing Discord roles so the server session refreshes its role snapshot. Admin roles are an explicit comma-separated list of numeric Discord role IDs; an empty list exposes no private history.

## When the website moves to another machine

The collector can stay inside the website process on the new machine. Connect the hosts over a private network or VPN and change `RABBITMQ_URL` to the Dune host's private DNS name on TLS port 5672. Use a private HTTPS reverse proxy for the broker management API (upstream port 15672), and set `RABBITMQ_MANAGEMENT_URL` to that HTTPS address. Restrict both endpoints to the website host. The management proxy must preserve the observer account's Basic authorization header.

The AMQPS certificate must match the configured hostname, or set `RABBITMQ_TLS_SERVERNAME` to the certificate's valid name and provide its CA. The management HTTPS certificate must also be trusted by Node; `RABBITMQ_CA_PEM` applies only to AMQP, not HTTP. Never disable certificate verification. Alternatively, an SSH tunnel can provide loopback management access while AMQPS remains certificate-verified.

No feature code change is needed. Keep the existing Redis service reachable from the website machine. Stop the old portal instance during cutover, transfer server environment secrets securely, and restart the new instance. History is scoped to broker connection configuration, so changing the broker URL starts a new retained-history namespace. Existing login sessions persist only if the same Redis and cookie hostname are retained. A short capture gap during migration is expected.

## Captured data and limitations

- Instance `status.*` fanout readings: raw state code, map, timestamp and destination when present. Unknown values stay unknown.
- `chat.intercept`: bounded message text, sender ID, channel and source timestamp. Whisper/private/direct channels are excluded; remaining chat is admin-only.
- `notifications`: confirmed nested player activity fields including map, instance, dimensions and authority transfer. Admin-only; these are not inferred login/logout events.
- Heartbeats and travel queue direct exchanges: bindings discovered from current topology. Respawn fanout: metadata only. Unknown payloads are never exposed as raw data. Heartbeat traffic is not a health or population metric.

The observer has its own temporary queue with 1,000-message / 4 MiB limits and 60-second message TTL. It never drains a game queue. Histories retain up to 500 events per kind for 24 hours; the API returns at most 100 per kind. High traffic can shorten the visible window. Chat IDs are deduplicated. Discovery repeats every five minutes by reconnecting; reconnects, restarts and overload can lose observations. No completeness guarantee or historical backfill is possible. The existing population graph remains based on Console population samples, not RabbitMQ traffic.

## Activation check

1. Enable the variables and restart with a reachable broker and Redis.
2. Open Live Intel: observer link should become connected. Send a public map chat in game and inspect it with an admin role.
3. Change map and compare observed activity to the actual transition. Do not assign meanings to undocumented numeric states.
4. Confirm a normal member sees instance readings only. Stop the broker briefly: the page must report stale/disconnected, then reconnect after restoration.

This code has not been verified against your live broker credentials. Default configuration leaves the collector disabled. No game chat is sent by this integration.
