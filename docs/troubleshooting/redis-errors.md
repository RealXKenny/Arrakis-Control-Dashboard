# Redis errors

Reference: [Redis](../configuration/redis.md), [Redis Cluster](../configuration/redis-cluster.md), [Redis security](../security/redis-security.md).

## Standalone

| Symptom                                                      | Cause                                                                                         | Fix                                                                       |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| HTTP 503 `RATE_LIMIT_UNAVAILABLE`; audit `security.control_failure` | Redis unreachable; the limiter fails closed                                              | Restore Redis; the next request after recovery works (no restart needed)   |
| `Redis is unavailable.` / `Redis connection is closed.` in feature errors | Connection down or closed; commands fail within ~1.5 s rather than hang              | Check network, password, TLS                                              |
| Startup 500: `REDIS_URL` invalid                             | URL has a query/hash, bad scheme, or invalid database path                                      | Use `redis://[:password@]host:port/N` or `rediss://…`                      |
| Startup 500: plain-text and unauthenticated on a public-looking host | Production safety check                                                                 | Add a password / TLS; do not set `REDIS_ALLOW_INSECURE`                     |
| `NOAUTH Authentication required` / `WRONGPASS`               | Missing or wrong password in `REDIS_URL`                                                         | Fix credentials (percent-encode special characters)                        |
| TLS handshake errors                                         | `rediss://` to a non-TLS port, or untrusted certificate                                          | Use the TLS port; trust the CA for Node                                    |
| Everyone signed out                                          | Redis restarted without persistence, `FLUSHDB`, or a different database number                    | Enable persistence; use a dedicated database                               |
| Memory growth                                                | Many sessions/listings; audit cap not set low enough                                              | Tune `AUDIT_LOG_MAX_ENTRIES`; set `maxmemory` with a safe policy           |
| Integration tests fail on `EVAL`                             | Redis server older than the scripts need or scripting disabled                                    | Use Redis 7.x                                                             |

## Redis Cluster

<a id="redis-cluster"></a>

| Symptom                                              | Cause                                                                                         | Fix                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `CROSSSLOT` / "must keep all N keys in one hash slot" | A multi-key script was given keys without a shared hash tag (code change)                       | Use the key builders in `src/lib/redis/keys.ts`                            |
| `None of startup nodes is available`                 | Wrong `REDIS_CLUSTER_NODES`, firewall, nodes down, or cluster not created                       | Check `redis-cli --cluster check host:port`                                |
| `MOVED` / `ASK` errors briefly during failover       | Topology changing                                                                             | Retry; the client refreshes slots automatically                            |
| `READONLY You can't write against a read only replica` | A client talked to a node that was just demoted                                                | Transient after failover; persists only with a stale topology — restart the app |
| `CLUSTERDOWN`                                        | Not all slots covered or a shard lost its quorum                                               | Repair the cluster                                                         |
| Cluster works but `REDIS_URL` missing at startup     | Production still requires `REDIS_URL` (carries credentials/TLS)                                  | Set it to any node with the credentials                                    |
| Re-key tools do nothing                              | `REDIS_CLUSTER_NODES` empty in the tool's environment                                             | Set it (the tool loads `.env` from the working directory)                  |

## Diagnose

```bash
redis-cli -u "$REDIS_URL" ping
redis-cli -u "$REDIS_URL" info server | head -5
redis-cli --cluster check <host>:<port>        # Cluster only
```
