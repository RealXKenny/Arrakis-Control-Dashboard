# Webhooks (release announcements)

## Purpose

Post release notes and progress announcements from the dashboard into a Discord channel. It is the only outbound webhook.

## Configure

| Variable                  | Meaning                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------- |
| `CHANGELOG_WEBHOOK_URL`   | A Discord webhook URL. Only genuine Discord webhook URLs are accepted. **It is a secret** (hidden in the Pterodactyl egg) |
| `CHANGELOG_AUTO_ANNOUNCE` | `true` announces each newly deployed release in `CHANGELOG.md` once, automatically at startup         |

1. In Discord: *Channel settings → Integrations → Webhooks → New Webhook*, copy the URL.
2. Set `CHANGELOG_WEBHOOK_URL`; optionally `CHANGELOG_AUTO_ANNOUNCE=true`. Restart.

## Use

Administrators compose announcements at `/admin/changelog`, which calls `POST /api/v2/changelog/announce` (same-origin, administrator,
sign-in within the general window, 20 per hour, body up to 64 KiB). Announcements use link buttons and never ping. The result says
whether an existing announcement was edited. Each announcement is audited (`admin.announcement`).

## Verify

Trigger a test announcement from `/admin/changelog` and confirm the message appears; an invalid URL fails startup validation with
`CHANGELOG_WEBHOOK_URL` named.

## Security

Anyone with the URL can post to the channel: keep it out of Git and logs, and delete/recreate the webhook in Discord if leaked.

## Troubleshooting

Nothing is posted: webhook deleted or channel permissions changed; `CHANGELOG_AUTO_ANNOUNCE` only announces a version once.
