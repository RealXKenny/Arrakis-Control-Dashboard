import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Backslashes and dollar signs below are written for bash. In this JavaScript template a backslash must be doubled
// and "${" must be escaped, so every shell expansion is spelled without braces except the two defaulted variables.
const installationScript = `#!/bin/bash
set -euo pipefail

# Reinstalling over an existing installation must never overwrite, reset or re-permission the operator's files
# (.env, certificates, custom folders). Updates of an existing install are done by the automatic updater at startup,
# which checks every file for local changes first. To start over, empty the server's files deliberately first.
updater_dir='scripts/deployment/updater'
bootstrap=false
if [ -e /mnt/server/package.json ]; then
  if [ -e "/mnt/server/$updater_dir/supervisor.mjs" ]; then
    echo "An existing installation was found in /home/container. Nothing was changed: the automatic updater installs new releases at startup without touching custom files."
    exit 0
  fi
  # An install from before automatic updates (2.0.0) has no updater to move it forward. Add only the updater files and
  # its settings; every existing file stays as it is, and the updater upgrades the rest at the next start.
  bootstrap=true
  echo "An installation from before automatic updates was found. Adding the automatic updater only; no existing file is changed."
fi

apt-get update
apt-get install --yes --no-install-recommends ca-certificates curl jq tar coreutils findutils
rm -rf /var/lib/apt/lists/*

work_dir=$(mktemp -d)
trap 'rm -rf "$work_dir"' EXIT
release_file="$work_dir/release.json"
archive_file="$work_dir/source.tar.gz"
api='https://api.github.com/repos/RealXKenny/Arrakis-Control-Dashboard/releases'

# RELEASE_TAG pins an exact version (for example v2.1.0). Empty or "latest" installs the newest release.
tag="\${RELEASE_TAG:-latest}"
# Matched as one whole string: a multi-line value cannot slip a valid first line past a line-based grep.
tag_pattern='^v[0-9]+\\.[0-9]+\\.[0-9]+$'
if [ "$tag" = "latest" ] || [ -z "$tag" ]; then
  release_url="$api/latest"
elif [[ "$tag" =~ $tag_pattern ]]; then
  release_url="$api/tags/$tag"
else
  echo "RELEASE_TAG must be latest or a version such as v2.1.0." >&2
  exit 1
fi

curl --fail --silent --show-error --location --retry 3 --header 'Accept: application/vnd.github+json' --header 'X-GitHub-Api-Version: 2022-11-28' "$release_url" --output "$release_file"

# Releases publish a source archive and its SHA-256 as assets. The archive is verified before anything in it runs.
asset_url=$(jq --raw-output '[.assets[]? | select(.name | test("^arrakis-control-dashboard-[0-9]+\\\\.[0-9]+\\\\.[0-9]+\\\\.tar\\\\.gz$"))][0].browser_download_url // empty' "$release_file")
sum_url=$(jq --raw-output '[.assets[]? | select(.name | test("^arrakis-control-dashboard-[0-9]+\\\\.[0-9]+\\\\.[0-9]+\\\\.tar\\\\.gz\\\\.sha256$"))][0].browser_download_url // empty' "$release_file")

if [ -n "$asset_url" ] && [ -n "$sum_url" ]; then
  curl --fail --silent --show-error --location --retry 3 "$asset_url" --output "$archive_file"
  curl --fail --silent --show-error --location --retry 3 "$sum_url" --output "$work_dir/source.sha256"
  expected=$(awk '{print $1}' "$work_dir/source.sha256" | head -n 1)
  printf '%s' "$expected" | grep -Eq '^[0-9a-f]{64}$'
  echo "$expected  $archive_file" | sha256sum --check --status
  echo "Source archive checksum verified."
elif [ -z "$asset_url" ] && [ -z "$sum_url" ] && [ "\${ALLOW_UNVERIFIED_RELEASE:-false}" = "true" ]; then
  # Releases created before checksums were published install only when the operator explicitly accepts that.
  echo "WARNING: ALLOW_UNVERIFIED_RELEASE is true; installing the unverified GitHub source tarball." >&2
  download_url=$(jq --exit-status --raw-output '.tarball_url // empty' "$release_file")
  test -n "$download_url"
  curl --fail --silent --show-error --location --retry 3 "$download_url" --output "$archive_file"
else
  # Fail closed: a release without a complete archive and checksum pair is not installed.
  echo "This release has no complete published checksum, so it cannot be verified. Install a newer release, or set ALLOW_UNVERIFIED_RELEASE=true to accept an unverified older one." >&2
  exit 1
fi

# Inspect the archive before anything is written: plain files and directories only (the project tracks no links),
# and no absolute or parent-directory paths. Here-strings avoid pipelines, so pipefail cannot hide a match.
member_types=$(tar -tvzf "$archive_file" | cut -c1)
member_names=$(tar -tzf "$archive_file")
if grep -Eq '^[^-d]' <<< "$member_types"; then
  echo "The release archive contains links or special files, which a release never needs; refusing to extract it." >&2
  exit 1
fi
if grep -Eq '(^/|(^|/)\\.\\.(/|$))' <<< "$member_names"; then
  echo "The release archive contains absolute or parent-directory paths; refusing to extract it." >&2
  exit 1
fi

if [ "$bootstrap" = true ]; then
  release_dir="$work_dir/release"
  mkdir -p "$release_dir"
  tar -xzf "$archive_file" --strip-components=1 --no-same-owner --no-same-permissions -C "$release_dir"
  if ! jq --exit-status '.arrakisRelease | objects' "$release_dir/package.json" > "$work_dir/release-config.json" || [ ! -f "$release_dir/$updater_dir/supervisor.mjs" ]; then
    echo "This release does not include the automatic updater, so it cannot be added. Nothing was changed." >&2
    exit 1
  fi
  # Nothing is written through a symbolic link: each target must resolve to itself inside the install directory.
  for dir in "$updater_dir" .arrakis; do
    if [ "$(readlink -m "/mnt/server/$dir")" != "$(readlink -m /mnt/server)/$dir" ]; then
      echo "/home/container/$dir leads through a symbolic link; refusing to add the updater. Nothing was changed." >&2
      exit 1
    fi
  done
  mkdir -p "/mnt/server/$updater_dir" /mnt/server/.arrakis
  chown 1000:1000 "/mnt/server/$updater_dir" /mnt/server/.arrakis
  added='{}'
  for source in "$release_dir/$updater_dir"/*; do
    [ -f "$source" ] || continue
    name="$updater_dir/$(basename "$source")"
    # Never replace a file that is already there.
    if [ -e "/mnt/server/$name" ] || [ -L "/mnt/server/$name" ]; then continue; fi
    cp "$source" "/mnt/server/$name"
    chown 1000:1000 "/mnt/server/$name"
    added=$(jq --arg name "$name" --arg hash "$(sha256sum "/mnt/server/$name" | awk '{print $1}')" '. + {($name): $hash}' <<< "$added")
  done
  if [ ! -e /mnt/server/.arrakis/bootstrap.json ] && [ ! -L /mnt/server/.arrakis/bootstrap.json ]; then
    jq --null-input --slurpfile release "$work_dir/release-config.json" --argjson files "$added" '{release: $release[0], files: $files}' > /mnt/server/.arrakis/bootstrap.json
    chown 1000:1000 /mnt/server/.arrakis/bootstrap.json
  fi
  echo "Automatic updater added. Set the startup command to: cd /home/container && exec node $updater_dir/supervisor.mjs (Admin > Servers > Startup), then start the server. It installs the newest release at startup and keeps .env, certificates and your own files."
  exit 0
fi

mkdir -p /mnt/server
tar -xzf "$archive_file" --strip-components=1 --no-same-owner --no-same-permissions -C /mnt/server
# Refuse an archive whose symbolic links lead outside the install directory.
bad_link=$(find /mnt/server -type l -exec sh -c 'for link; do target=$(readlink -f "$link"); case "$target" in /mnt/server|/mnt/server/*) ;; *) echo "$link" ;; esac; done' sh {} + | head -n 1)
if [ -n "$bad_link" ]; then
  echo "The release archive contains a symbolic link that points outside the install directory." >&2
  exit 1
fi
cd /mnt/server
# Anonymous framework telemetry stays off during the build.
export NEXT_TELEMETRY_DISABLED=1
# Dependency install scripts never run as root during installation; the build needs none.
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm prune --omit=dev --no-audit --no-fund
chown -R 1000:1000 /mnt/server
`;

/**
 * Variables that hold credentials. Pterodactyl hides a non-viewable variable from the Startup tab of the server owner
 * and subusers; only panel administrators can read or change it (Admin > Servers > Startup). That is access control
 * in the panel, not encryption: anyone who can read the server's files, process environment or console can still see
 * these values once the server runs.
 */
export const SECRET_VARIABLES = Object.freeze([
  'AUTH_SECRET',
  'REDIS_URL',
  'DUNE_API_KEY',
  'DUNE_ADAPTER_TOKEN',
  'DISCORD_CLIENT_SECRET',
  'BOT_API_TOKEN',
  'OWNER_KEY_SECRET',
  'DISCORD_BOT_TOKEN',
  'ROADMAP_GITHUB_TOKEN',
  'RABBITMQ_URL',
  'RABBITMQ_TLS_KEY',
  'AUTO_UPDATE_GITHUB_TOKEN',
  'UPDATE_WEBHOOK_SECRET',
]);

/** Automatic-update settings shared in meaning with the bot egg. RELEASE_TAG (above) doubles as the version pin. */
const UPDATE_VARIABLES = [
  variable(
    'Automatic Updates',
    'Check GitHub for verified releases and install them safely. Custom files are never overwritten.',
    'AUTO_UPDATE_ENABLED',
    'true',
    { rules: 'required|string|in:true,false' },
  ),
  variable('Update On Startup', 'Check for an update each time the server starts.', 'AUTO_UPDATE_ON_STARTUP', 'true', {
    rules: 'required|string|in:true,false',
  }),
  variable(
    'Update Channel',
    'stable installs normal releases only; prerelease also installs release candidates.',
    'AUTO_UPDATE_CHANNEL',
    'stable',
    { rules: 'required|string|in:stable,prerelease' },
  ),
  variable('Update Check Interval (h)', 'Hours between background checks (1-168).', 'AUTO_UPDATE_INTERVAL_HOURS', '6', {
    rules: 'required|integer|min:1|max:168',
  }),
  variable(
    'Update Window (UTC)',
    'Optional HH:MM-HH:MM UTC window for background installs, for example 03:00-05:00. Empty allows any time.',
    'AUTO_UPDATE_WINDOW_UTC',
    '',
    { rules: 'nullable|string|regex:/^([01][0-9]|2[0-3]):[0-5][0-9]-([01][0-9]|2[0-3]):[0-5][0-9]$/' },
  ),
  variable(
    'Update Health Period (s)',
    'Seconds a new version must stay up after reporting ready before it is kept (30-900).',
    'AUTO_UPDATE_HEALTH_SECONDS',
    '120',
    { rules: 'required|integer|min:30|max:900' },
  ),
  variable(
    'Update GitHub Token',
    'Optional read-only token for release downloads (raises the GitHub rate limit). Never needs write access.',
    'AUTO_UPDATE_GITHUB_TOKEN',
    '',
    { rules: 'nullable|string|max:255' },
  ),
  variable(
    'Release Webhook Secret',
    'Secret of the GitHub release webhook (32+ characters). With it, new bot and dashboard releases install within seconds of being published.',
    'UPDATE_WEBHOOK_SECRET',
    '',
    { rules: 'nullable|string|min:32|max:256' },
  ),
  variable(
    'Release Signal Interval (s)',
    'Seconds between checks of the release signal (10-3600). The dashboard listens on its own endpoint.',
    'AUTO_UPDATE_SIGNAL_SECONDS',
    '30',
    { rules: 'required|integer|min:10|max:3600' },
  ),
];

function variable(name, description, envVariable, defaultValue = '', overrides = {}) {
  return {
    name,
    description,
    env_variable: envVariable,
    default_value: defaultValue,
    user_viewable: true,
    user_editable: true,
    rules: 'required|string',
    field_type: 'text',
    ...overrides,
  };
}

function buildEgg() {
  return {
    _comment:
      'Import this PTDL_v2 egg into a Pterodactyl nest. Installation downloads a GitHub release and verifies its checksum.',
    meta: { version: 'PTDL_v2', update_url: null },
    name: 'Arrakis Control Dashboard',
    author: 'realxkenny@users.noreply.github.com',
    description:
      'Dune: Awakening dashboard built from a GitHub release. Configure Dune Console, Discord OAuth, the public URL, and Redis before starting.',
    features: null,
    docker_images: { 'Node.js 22': 'ghcr.io/pterodactyl/yolks:nodejs_22' },
    file_denylist: [],
    startup: 'cd /home/container && exec node scripts/deployment/updater/supervisor.mjs',
    config: {
      files: '{}',
      startup: '{"done":"Arrakis Control Dashboard is listening"}',
      logs: '{}',
      stop: '^C',
    },
    scripts: {
      installation: {
        script: installationScript,
        container: 'node:22-bookworm',
        entrypoint: 'bash',
      },
    },
    variables: [
      variable(
        'Release Tag',
        'Version to install and stay on, such as v2.1.0. Leave as latest to follow the update channel.',
        'RELEASE_TAG',
        'latest',
        { rules: 'required|string|max:16' },
      ),
      variable(
        'Allow Unverified Release',
        'Leave false. Set true only to install an older release that has no published checksum.',
        'ALLOW_UNVERIFIED_RELEASE',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable(
        'Owner Key Secret',
        'Optional dedicated 32+ character secret for marketplace owner identifiers; derived from AUTH_SECRET when empty.',
        'OWNER_KEY_SECRET',
        '',
        { user_viewable: false, user_editable: true, rules: 'nullable|string|min:32|max:256' },
      ),
      variable(
        'API Worker Concurrency',
        'Active API requests per worker before overload returns 503.',
        'API_MAX_CONCURRENCY',
        '100',
        {
          rules: 'required|integer|min:1|max:10000',
        },
      ),
      variable(
        'Global Read Budget',
        'Requests per read route per minute shared through Redis.',
        'API_GLOBAL_READ_LIMIT',
        '2400',
        {
          rules: 'required|integer|min:1|max:100000000',
        },
      ),
      variable(
        'Trusted Proxy Count',
        'Exact reverse-proxy count; use 0 when exposed directly.',
        'TRUSTED_PROXY_COUNT',
        '1',
        {
          rules: 'required|integer|min:0|max:5',
        },
      ),
      variable(
        'Dashboard Bot API Token',
        'Optional independent secret for the read-only bot API.',
        'BOT_API_TOKEN',
        '',
        {
          rules: 'nullable|string|min:32|max:256',
        },
      ),
      variable('Log Level', 'Console verbosity; INFO is recommended.', 'LOG_LEVEL', 'INFO', {
        rules: 'required|string|in:DEBUG,INFO,WARN,ERROR,FATAL',
      }),
      variable(
        'Log Colours',
        'Console colours: auto (terminal or Pterodactyl), always or never.',
        'LOG_COLOR',
        'auto',
        {
          rules: 'required|string|in:auto,always,never',
        },
      ),
      variable(
        'Server Bind Address',
        'Bind to all interfaces so Wings can reach the dashboard.',
        'SERVER_HOSTNAME',
        '0.0.0.0',
      ),
      variable('Dune API URL', 'Dune Console URL reachable from this container.', 'DUNE_API_URL', '', {
        rules: 'required|url',
      }),
      variable('Dune API Key', 'Console API key for reads and season delivery.', 'DUNE_API_KEY'),
      variable('Dune Adapter Token', 'Token for the Console Discord adapter.', 'DUNE_ADAPTER_TOKEN'),
      variable('Discord Client ID', 'Discord OAuth application client ID.', 'DISCORD_CLIENT_ID'),
      variable('Discord Client Secret', 'Discord OAuth application client secret.', 'DISCORD_CLIENT_SECRET'),
      variable('Discord Guild ID', 'Discord server whose members may access the dashboard.', 'DISCORD_GUILD_ID'),
      variable(
        'Public App URL',
        'Canonical public HTTPS origin; the Discord callback is /api/auth/callback/discord.',
        'APP_URL',
        '',
        {
          rules: 'required|url',
        },
      ),
      variable(
        'Auth Secret',
        'At least 32 random characters for Auth.js state and sealed refresh tokens.',
        'AUTH_SECRET',
        '',
        {
          rules: 'required|string|min:32|max:256',
        },
      ),
      variable('Verified Member Role ID', 'Discord role required for dashboard access.', 'VERIFIED_MEMBER_ROLE_ID'),
      variable(
        'Moderator Role IDs',
        'Optional comma-separated Discord roles for moderation.',
        'MODERATOR_DISCORD_ROLE_IDS',
        '',
        {
          rules: 'nullable|string|max:520',
        },
      ),
      variable(
        'Backup Viewer Role IDs',
        'Optional separate comma-separated Discord roles for backup status.',
        'BACKUP_VIEWER_DISCORD_ROLE_IDS',
        '',
        {
          rules: 'nullable|string|max:520',
        },
      ),
      variable('Redis URL', 'Redis TCP URL with credentials; use rediss:// for TLS.', 'REDIS_URL'),
      variable(
        'Require Redis TLS',
        'Set to true to refuse to start unless Redis uses rediss://.',
        'REDIS_REQUIRE_TLS',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable(
        'Disable Next.js Telemetry',
        'Keeps anonymous Next.js usage telemetry off. Fixed at 1.',
        'NEXT_TELEMETRY_DISABLED',
        '1',
        { user_viewable: false, user_editable: false, rules: 'required|string|in:1' },
      ),
      variable(
        'Allow Insecure Redis',
        'Leave false. Only true accepts plain-text, passwordless Redis on a public-looking host.',
        'REDIS_ALLOW_INSECURE',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable(
        'Redis Cluster Nodes',
        'Optional comma-separated host:port bootstrap list for Redis Cluster.',
        'REDIS_CLUSTER_NODES',
        '',
        {
          rules: 'nullable|string',
        },
      ),
      variable(
        'Audit Log To Console',
        'Write security audit events as AUDIT JSON lines on stdout for log shipping.',
        'AUDIT_LOG_STDOUT',
        'true',
        { rules: 'required|string|in:true,false' },
      ),
      variable('Audit Log To Redis', 'Keep the bounded in-app audit trail in Redis.', 'AUDIT_LOG_REDIS', 'true', {
        rules: 'required|string|in:true,false',
      }),
      variable(
        'Audit Log Maximum Entries',
        'Most audit events kept in Redis (100-1000000); the oldest are dropped first.',
        'AUDIT_LOG_MAX_ENTRIES',
        '10000',
        { rules: 'required|integer|min:100|max:1000000' },
      ),
      variable(
        'Audit Log Retention Days',
        'Days of security audit events kept in Redis (1-3650).',
        'AUDIT_LOG_RETENTION_DAYS',
        '90',
        { rules: 'required|integer|min:1|max:3650' },
      ),
      variable(
        'Discord Bot Token',
        'Optional shared main bot token for Components V2 announcements. Never expose it to panel users.',
        'DISCORD_BOT_TOKEN',
        '',
        {
          rules: 'nullable|string|max:256',
        },
      ),
      variable(
        'Community Events Channel ID',
        'Discord text channel for automatically published community events.',
        'COMMUNITY_EVENTS_CHANNEL_ID',
        '',
        { rules: 'nullable|string|regex:/^[0-9]{15,25}$/' },
      ),
      variable(
        'Event Reviewer Role IDs',
        'Optional comma-separated Discord roles that review and judge event submissions.',
        'EVENT_REVIEWER_DISCORD_ROLE_IDS',
        '',
        { rules: 'nullable|string|max:520' },
      ),
      // Dune Console reads, shared caching and community pages.
      variable(
        'Dune API Timeout (ms)',
        'Optional read timeout for Console requests (1000-120000). Empty uses 20000; status probes cap at 10000.',
        'DUNE_API_TIMEOUT_MS',
        '',
        { rules: 'nullable|integer|min:1000|max:120000' },
      ),
      variable(
        'Dungeon Leaderboard Refresh (s)',
        'Seconds a shared dungeon leaderboard reading stays fresh before one background refresh (60-3600).',
        'DUNGEON_LEADERBOARD_REFRESH_SECONDS',
        '300',
        { rules: 'required|integer|min:60|max:3600' },
      ),
      variable(
        'Roadmap Repositories',
        'Comma-separated public owner/repository list whose approved roadmap issues are shown (up to 5).',
        'ROADMAP_REPOSITORIES',
        'RealXKenny/Arrakis-Control-Dashboard,RealXKenny/Arrakis-Control-Bot',
        { rules: 'required|string|max:600' },
      ),
      variable(
        'Roadmap Label',
        'Only issues carrying this label appear on the public roadmap.',
        'ROADMAP_LABEL',
        'roadmap',
        { rules: 'required|string|max:50' },
      ),
      variable(
        'Roadmap Refresh (s)',
        'Seconds the shared roadmap reading stays fresh (300-86400).',
        'ROADMAP_REFRESH_SECONDS',
        '1200',
        { rules: 'required|integer|min:300|max:86400' },
      ),
      variable(
        'Roadmap GitHub Token',
        'Optional read-only token (public repository access only) that raises the GitHub rate limit for the roadmap.',
        'ROADMAP_GITHUB_TOKEN',
        '',
        { rules: 'nullable|string|max:255' },
      ),
      // Optional features, all off by default.
      variable(
        'Solaris Exchange Enabled',
        'Real Solaris deposits, withdrawals and play. Read docs/features/solaris-exchange.md before enabling.',
        'CASINO_SOLARIS_ENABLED',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable('Casino Max Wager', 'Largest single wager in whole Solaris.', 'CASINO_MAX_WAGER', '10000', {
        rules: 'required|integer|min:1|max:1000000000000',
      }),
      variable('Casino Max Payout', 'Largest payout of one round in whole Solaris.', 'CASINO_MAX_PAYOUT', '1000000', {
        rules: 'required|integer|min:1|max:1000000000000',
      }),
      variable(
        'Poker Activity Enabled',
        "Play-money Hold'em Discord Activity. Needs the Discord application credentials and the bot token.",
        'POKER_ACTIVITY_ENABLED',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable(
        'Live Chat Enabled',
        'Live game chat through RabbitMQ. When true, the RabbitMQ URL, bridge ID and chat servers are required.',
        'CHAT_ENABLED',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable('RabbitMQ URL', 'amqps:// URL with credentials for live chat.', 'RABBITMQ_URL', '', {
        rules: 'nullable|string|max:2048',
      }),
      variable('Chat Bridge Funcom ID', 'Funcom ID the chat bridge publishes as.', 'CHAT_BRIDGE_FUNCOM_ID', '', {
        rules: 'nullable|string|max:200',
      }),
      variable(
        'Chat Discord Bot Funcom ID',
        'Funcom ID of the Discord bot relay, so its messages show as Discord relays.',
        'CHAT_DISCORD_BOT_FUNCOM_ID',
        '',
        { rules: 'nullable|string|max:200' },
      ),
      variable(
        'Chat Bridge Display Name',
        'Optional in-game display name for the bridge.',
        'CHAT_BRIDGE_DISPLAY_NAME',
        '',
        {
          rules: 'nullable|string|max:80',
        },
      ),
      variable(
        'Chat Servers',
        'JSON list of chat servers, for example [{"id":"hagga-basin","label":"Hagga Basin","map":"HaggaBasin.0"}].',
        'CHAT_SERVERS',
        '',
        { rules: 'nullable|string|max:32768' },
      ),
      variable(
        'Chat Proximity Enabled',
        'Also show proximity (nearby) game chat from the chat servers, labelled Proximity. Read-only.',
        'CHAT_PROXIMITY_ENABLED',
        'false',
        { rules: 'required|string|in:true,false' },
      ),
      variable(
        'RabbitMQ TLS Enabled',
        'Optional; empty follows the URL scheme (amqps:// uses TLS).',
        'RABBITMQ_TLS_ENABLED',
        '',
        { rules: 'nullable|string|in:true,false' },
      ),
      variable('RabbitMQ TLS Server Name', 'Optional TLS server name override.', 'RABBITMQ_TLS_SERVERNAME', '', {
        rules: 'nullable|string|max:253',
      }),
      variable('RabbitMQ CA (PEM)', 'Optional inline CA certificate PEM.', 'RABBITMQ_TLS_CA', '', {
        rules: 'nullable|string|max:262144',
      }),
      variable(
        'RabbitMQ Client Certificate (PEM)',
        'Optional inline client certificate PEM.',
        'RABBITMQ_TLS_CERT',
        '',
        {
          rules: 'nullable|string|max:262144',
        },
      ),
      variable('RabbitMQ Client Key (PEM)', 'Optional inline client private key PEM.', 'RABBITMQ_TLS_KEY', '', {
        rules: 'nullable|string|max:65536',
      }),
      variable(
        'RabbitMQ CA Path',
        'Optional CA file path, relative to /home/container or absolute. Updates never move or change this file.',
        'RABBITMQ_TLS_CA_PATH',
        '',
        { rules: 'nullable|string|max:4096' },
      ),
      variable(
        'RabbitMQ Client Certificate Path',
        'Optional client certificate file path.',
        'RABBITMQ_TLS_CERT_PATH',
        '',
        {
          rules: 'nullable|string|max:4096',
        },
      ),
      variable('RabbitMQ Client Key Path', 'Optional client private key file path.', 'RABBITMQ_TLS_KEY_PATH', '', {
        rules: 'nullable|string|max:4096',
      }),
      variable(
        'RabbitMQ CA File (legacy)',
        'Legacy CA path fallback; prefer RABBITMQ_TLS_CA_PATH.',
        'RABBITMQ_CA_FILE',
        '',
        {
          rules: 'nullable|string|max:4096',
        },
      ),
      variable(
        'RabbitMQ Verify TLS',
        'Certificate verification cannot be disabled. Fixed at true.',
        'RABBITMQ_TLS_REJECT_UNAUTHORIZED',
        'true',
        { user_editable: false, rules: 'required|string|in:true' },
      ),
      variable(
        'Chat Bridge Queue (legacy)',
        'Legacy setting; receive queues are broker-generated.',
        'CHAT_BRIDGE_QUEUE',
        'arrakis.dashboard.chat.v1',
        {
          rules: 'required|string|max:128',
        },
      ),
      variable(
        'Chat Bridge Prefetch',
        'Unacknowledged chat messages per bridge (1-100).',
        'CHAT_BRIDGE_PREFETCH',
        '20',
        {
          rules: 'required|integer|min:1|max:100',
        },
      ),
      variable(
        'Chat Bridge Health Host',
        'Loopback address of the bridge health endpoint.',
        'CHAT_BRIDGE_HEALTH_HOST',
        '127.0.0.1',
        {
          rules: 'required|string|max:253',
        },
      ),
      variable('Chat Bridge Health Port', 'Port of the bridge health endpoint.', 'CHAT_BRIDGE_HEALTH_PORT', '2010', {
        rules: 'required|integer|min:1|max:65535',
      }),
      variable(
        'Chat History Messages',
        'Most chat messages kept in Redis (50-100000).',
        'CHAT_HISTORY_MAX_MESSAGES',
        '10000',
        {
          rules: 'required|integer|min:50|max:100000',
        },
      ),
      variable('Chat History Days', 'Days chat history is kept (1-90).', 'CHAT_HISTORY_RETENTION_DAYS', '7', {
        rules: 'required|integer|min:1|max:90',
      }),
      variable('Chat Message Max Characters', 'Longest chat message (100-1800).', 'CHAT_MESSAGE_MAX_CHARS', '1000', {
        rules: 'required|integer|min:100|max:1800',
      }),
      variable('Chat Send Limit', 'Messages one member may send per window.', 'CHAT_SEND_RATE_LIMIT', '10', {
        rules: 'required|integer|min:1|max:1000',
      }),
      variable('Chat Server Send Limit', 'Messages per chat server per window.', 'CHAT_SERVER_SEND_RATE_LIMIT', '60', {
        rules: 'required|integer|min:1|max:10000',
      }),
      variable(
        'Chat Send Window (s)',
        'Length of the chat rate-limit window in seconds.',
        'CHAT_SEND_RATE_WINDOW_SECONDS',
        '10',
        {
          rules: 'required|integer|min:1|max:300',
        },
      ),
      // Automatic updates (see docs/deployment/automatic-updates.md).
      ...UPDATE_VARIABLES,
    ],
  };
}

async function writeEgg(path) {
  if (!path) throw new Error('Usage: node scripts/deployment/build-pterodactyl-egg.mjs <output.json>');
  await writeFile(path, `${JSON.stringify(createPterodactylEgg(), null, 2)}\n`, 'utf8');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeEgg(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to generate the Pterodactyl egg.');
    process.exitCode = 1;
  });
}

export function createPterodactylEgg() {
  const egg = buildEgg();
  egg.variables = egg.variables.map((entry) =>
    SECRET_VARIABLES.includes(entry.env_variable) ? { ...entry, user_viewable: false, user_editable: false } : entry,
  );
  return egg;
}
