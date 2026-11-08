# Administrator access

## Who is an administrator

`isDashboardAdmin` (in `src/features/admin/server/access.ts`) is true only when **all** hold for the server-side session:

1. it has not expired;
2. the user's Discord ID is in `ADMIN_DISCORD_IDS`;
3. its guild equals `DISCORD_GUILD_ID`;
4. it holds `VERIFIED_MEMBER_ROLE_ID` (when configured).

Every administrator page and API re-checks this; nothing the browser sends widens it. The administration navigation link
appears only for a verified administrator.

### `ADMIN_DISCORD_IDS`

| Environment                  | Empty value means                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Production                   | **Startup fails** (`Missing server environment configuration: ADMIN_DISCORD_IDS`), and no one is an administrator |
| Development / test           | The project owner's built-in Discord ID is the only administrator (convenience only)                |

Format: comma-separated numeric IDs, e.g. `111111111111111111,222222222222222222`. Restart after changing.

## Step-up re-authentication

An administrator who only *reads* needs just a valid session. A *change* also needs an interactive sign-in
(`authenticatedAt`) that is recent enough:

| Window  | Variable                         | Default | Applies to                                                                                             |
| ------- | -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| General | `ADMIN_REAUTH_HOURS` (1-168)     | 12      | Release announcements, administrator replies in the guild support chat, and operations on the low-risk list |
| High    | `ADMIN_HIGH_RISK_REAUTH_MINUTES` (5-1440) | 60 | Every other mutating operation, every upload and download, signing out everywhere                       |

The classification lives in one file, `src/features/admin/server/risk.ts`:

- downloads, uploads, multipart, `DELETE` and operations that carry a confirmation phrase are **high risk**;
- any other non-GET operation is **high risk unless** it is on the reviewed `LOW_RISK_MUTATING_OPERATIONS` list (update checks,
  probes, listings, link verification, login/logout/preflight);
- plain `GET` reads need no step-up.

So a **new catalog operation is strict by default.** When the window has passed the API returns `403 ADMIN_REAUTH_REQUIRED` and
records `admin.reauth_required`.

## Console credentials

Administration calls use the separate `ADMIN_CONSOLE_API_KEY` (or `ADAPTER_TOKEN` for adapter operations). Without them the
panel stays read-only/disabled. See [Dune Console](dune-console.md).

## Verify

`GET /api/v2/admin/overview` is `401` signed out, `403` for a non-administrator, `200` for an administrator.

## Troubleshooting

| Symptom                                  | Fix                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/admin` is `403`                        | Your ID is not in `ADMIN_DISCORD_IDS`, wrong guild, or the role is missing                 |
| Site returns 500 after deploy            | `ADMIN_DISCORD_IDS` is empty in production                                                |
| Writes keep asking to sign in again      | Window elapsed; sign in again and repeat within the window; consider the windows above     |

## Related

[Administrator panel](../features/administrator-panel.md) · [Permissions and API behaviour](../api/administrator.md) · [Session management](../administration/session-management.md)
