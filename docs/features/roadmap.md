# Roadmap

`/roadmap` is a public page (no sign-in) that shows planned, in-development, testing and released work for the dashboard and the bot. It is listed under **Community → News & status**.

## GitHub is the source of truth

The roadmap is built from GitHub issues in the repositories named by `ROADMAP_REPOSITORIES` (default: both Arrakis Control repositories). Nothing is maintained twice.

An issue appears only when **all** of these hold:

- it carries the approval label (`ROADMAP_LABEL`, default `roadmap`) — only maintainers can apply labels, so this is the explicit approval step;
- it is an issue, not a pull request;
- none of its labels mention security, vulnerability, private, internal, confidential or embargo;
- it is open, or it was closed as completed (closed as "not planned" or duplicate removes it).

| GitHub field                                                                          | Roadmap meaning                                                           |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `status: planned`, `status: in progress`, `status: testing`, `status: released` label | Status. Without a label: open is Planned, closed as completed is Released |
| `area: dashboard`, `area: bot`, `area: integrations`, `area: infrastructure` label    | Category. Without a label the repository decides (Dashboard or Bot)       |
| Milestone named like `2.1.0` or `v2.1.0`                                              | Confirmed target version                                                  |
| Milestone due date                                                                    | Shown only when a maintainer set one                                      |
| `## Roadmap summary` section in the issue body, else the first paragraph              | Plain-text summary (HTML, images, code blocks and comments are removed)   |

Do not put security reports on the roadmap; use the private process in `SECURITY.md`.

## Caching and outages

One shared reading per `ROADMAP_REFRESH_SECONDS` (default 20 minutes) serves every visitor. Refreshes send `If-None-Match`, so an unchanged repository costs a 304 that does not count against GitHub's rate limit. The last good reading is kept for 30 days, so a GitHub outage or rate limit leaves the page on its cached copy with a "Cached copy" badge. Visitors never trigger their own GitHub request.

`ROADMAP_GITHUB_TOKEN` is optional. Without it the dashboard uses GitHub's anonymous limit (60 requests per hour per IP), which is plenty at the default interval. If you set one, use a fine-grained token with read-only access to public repositories and no other permissions; it is server-only and never logged.

## Adding an entry

1. Open (or pick) an issue that describes confirmed work.
2. Add the `roadmap` label, one `status: …` label and, if useful, one `area: …` label.
3. Assign a version milestone only when the target release is confirmed.

The page picks the change up at the next refresh.
