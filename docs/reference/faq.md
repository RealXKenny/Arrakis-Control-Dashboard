# FAQ

**Does the dashboard install or run my Dune server?** No. RedBlink Dune Docker does; the dashboard only calls its Console API
([RedBlink integration](../integrations/redblink-dune-docker.md)).

**Do I need a database?** No. Redis is the only store ([Redis](../configuration/redis.md)).

**Is there a Docker image?** No. Use Node.js directly or the Pterodactyl egg ([installation](../installation/README.md)).

**Why does production return HTTP 500 for every page?** The configuration check failed and the server refuses to serve; the log names the variable
([startup errors](../troubleshooting/startup-errors.md)).

**Who is an administrator?** Only Discord IDs in `ADMIN_DISCORD_IDS` (required in production), in the right guild with the role
([administrator access](../configuration/administrator-access.md)).

**Why am I asked to sign in again for an admin action?** Step-up re-authentication: 60 minutes for high-risk operations, 12 hours for the rest
([administrator panel](../features/administrator-panel.md#step-up-re-authentication)).

**Is MFA supported?** No. Enable 2FA on administrators' Discord accounts ([security overview](../security/security-overview.md#known-limitations-and-accepted-risks)).

**How do I sign out all my devices?** An administrator can call `DELETE /api/v2/admin/sessions`; there is no button yet ([sessions](../features/sessions.md)).

**Can I use my own Redis Cluster?** Yes, with `REDIS_CLUSTER_NODES` plus a `REDIS_URL` for credentials ([Redis Cluster](../configuration/redis-cluster.md)).

**What happens if Redis goes down?** Sessions and feature data are unavailable and the rate limiter fails closed (503); recovery is automatic when Redis returns
([Redis errors](../troubleshooting/redis-errors.md)).

**Do I have to run the marketplace migration?** It is optional; both key generations work until you run it. Do it before relying on listing ownership long-term
([migration](../deployment/migration.md)).

**Can I update the game with the dashboard?** Only through Console operations in the administrator panel if your key and Console allow them; normally use `dune update`
([updates](../integrations/redblink-dune-docker.md#updating-both-systems)).

**Where do I report a vulnerability?** [SECURITY.md](../../SECURITY.md).

**Are my secrets safe in the Pterodactyl panel?** Hidden variables are protected from the server owner and subusers, but not from panel administrators or from anyone with
file, process or console access ([Pterodactyl](../installation/pterodactyl.md#limits-of-hidden-variables)).
