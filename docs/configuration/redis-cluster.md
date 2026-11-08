# Redis Cluster

## Overview

Set `REDIS_CLUSTER_NODES` to run the dashboard against a Redis Cluster. The command client and the data pool then use
`ioredis` `Cluster` with topology refresh, redirection following and endless capped retries. Multi-key Lua scripts only work
when all their keys are in one hash slot, so the key layout uses hash tags:

| Hash tag               | Holds                                                    | Consequence                                    |
| ---------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `{guilds}`             | all guild recruitment, applications, chats, support data | All guild data lives on one shard              |
| `{bm}`                 | base marketplace                                         | One shard                                      |
| `{audit}`              | audit trail                                              | One shard                                      |
| `{solido:<owner>}`     | one member's base-import ledger                          | Spreads across shards per member               |
| none                   | sessions, rate limits, caches, accounts                  | Spread across all shards                       |

The client refuses a script whose keys span slots (client-side check) instead of sending a request the server would reject.

## Configure

```dotenv
REDIS_CLUSTER_NODES=10.0.0.11:6379,10.0.0.12:6379,10.0.0.13:6379
REDIS_URL=rediss://:<PASSWORD>@10.0.0.11:6379
```

- Give a few bootstrap nodes (`host:port`, `[ipv6]:port` supported); the client discovers the rest.
- `REDIS_URL` is **still required in production** and supplies the username, password and TLS setting for every node. The
  database number is ignored (Clusters have one database).
- A warning is logged when `REDIS_CLUSTER_NODES` is set but `REDIS_URL` is not `rediss://`.

## Migration notes

- Legacy key names without hash tags must be renamed **on the original single node first**: run `npm run redis:rekey`
  (dry run), then `npm run redis:rekey -- --apply`, start the release that uses the new names, and only then copy the data to
  the cluster (`RENAME` cannot cross slots) and set `REDIS_CLUSTER_NODES`. The command lists conflicts and exits with status 2.
- `npm run marketplace:rekey` supports Cluster (it scans each master). It reads `REDIS_CLUSTER_NODES` and `REDIS_URL`.

## What was verified

The integration suite (`npm run test:integration` with `TEST_REDIS_CLUSTER_NODES`) ran against a real local 3-master /
3-replica Redis 7.4 Cluster, including a live `CLUSTER FAILOVER` of the marketplace shard under traffic with exact counter
reconciliation afterwards. Not verified: TLS/password on a cluster, crash failover, resharding under write load, a hosted
managed Redis service. See [Redis integration tests](../development/testing.md#redis-integration-tests) to reproduce.

## Limitations

- Guild, marketplace and audit data are each on a single shard by design; they will not scale across shards.
- Cross-slot operations are intentionally not used. Do not add multi-key scripts without a shared hash tag.
- Redirection during a failover can fail a request; the client reconnects and the next request succeeds.

## Operations

Use `redis-cli --cluster check <host:port>` for health, and take a backup of every master. Failover and resharding follow
standard Redis procedures; schedule them outside peak use and watch for `RATE_LIMIT_UNAVAILABLE` errors while a shard is moving.

## Troubleshooting

[Redis Cluster errors](../troubleshooting/redis-errors.md#redis-cluster)
