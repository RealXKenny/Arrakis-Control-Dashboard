# Notifications

## In the dashboard

The top navigation has a notifications menu (and a mobile section) with two kinds of unread indicators:

| Item               | Source                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Guild applications | Unread reviewer messages and status for your applications (`GET /api/guilds/application-status`)             |
| Guild support      | Unread administrator replies in a guild leader's support thread (`GET /api/guilds/{guildId}/support/status`) |

Unread counts are counted per conversation (at most 100) and cleared only when the browser **acknowledges the exact messages it
displayed**; merely loading a page never marks messages read. Administrators have an equivalent unread summary across guilds
(`GET /api/admin/guild-support-status`, up to 20 guild IDs).

## Outside the dashboard

Release announcements can be posted to Discord using the main bot and Components V2 containers ([Discord announcements](../integrations/webhooks.md)). There are no email,
push or browser notifications.

## Related

[Guild recruitment](guild-recruitment.md) · [Guilds](guilds.md)
