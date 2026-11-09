import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Backslashes and dollar signs below are written for bash. In this JavaScript template a backslash must be doubled
// and "${" must be escaped, so every shell expansion is spelled without braces except the two defaulted variables.
const installationScript = `#!/bin/bash
set -euo pipefail

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
  'CONSOLE_API_KEY',
  'ADMIN_CONSOLE_API_KEY',
  'ADAPTER_TOKEN',
  'DISCORD_CLIENT_SECRET',
  'BOT_API_TOKEN',
  'OWNER_KEY_SECRET',
  'DISCORD_BOT_TOKEN',
]);

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
    startup: 'cd /home/container && exec node scripts/server-launcher.mjs start',
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
        'Version to install, such as v2.1.0. Leave as latest to install the newest release.',
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
        'Admin Console API Key',
        'Optional privileged Console key; hidden from ordinary panel users.',
        'ADMIN_CONSOLE_API_KEY',
        '',
        {
          user_viewable: false,
          user_editable: false,
          rules: 'nullable|string',
        },
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
        'Server Bind Address',
        'Bind to all interfaces so Wings can reach the dashboard.',
        'SERVER_HOSTNAME',
        '0.0.0.0',
      ),
      variable('Dune Console URL', 'Dune Console URL reachable from this container.', 'CONSOLE_URL', '', {
        rules: 'required|url',
      }),
      variable('Dune Console API Key', 'Scoped Dune Console API key.', 'CONSOLE_API_KEY'),
      variable('Adapter Token', 'Adapter integration token.', 'ADAPTER_TOKEN'),
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
        'Administrator Discord IDs',
        'Required. Comma-separated Discord user IDs allowed to use the administrator workspace.',
        'ADMIN_DISCORD_IDS',
        '',
        { rules: 'required|regex:/^\\d{1,25}(\\s*,\\s*\\d{1,25})*$/' },
      ),
      variable(
        'Administrator High-Risk Reauthentication Minutes',
        'Destructive administrator actions need an interactive sign-in this recent (5-1440).',
        'ADMIN_HIGH_RISK_REAUTH_MINUTES',
        '60',
        { rules: 'required|integer|min:5|max:1440' },
      ),
      variable(
        'Administrator Reauthentication Hours',
        'Administrator changes need an interactive sign-in this recent (1-168).',
        'ADMIN_REAUTH_HOURS',
        '12',
        { rules: 'required|integer|min:1|max:168' },
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
        'Changelog Channel ID',
        'Discord text channel for release and progress announcements.',
        'CHANGELOG_CHANNEL_ID',
        '',
        { rules: 'nullable|string|regex:/^[0-9]{15,25}$/' },
      ),
      variable(
        'Community Events Channel ID',
        'Discord text channel for automatically published community events.',
        'COMMUNITY_EVENTS_CHANNEL_ID',
        '',
        { rules: 'nullable|string|regex:/^[0-9]{15,25}$/' },
      ),
      variable(
        'Changelog Auto Announce',
        'Announce each newly deployed changelog release once.',
        'CHANGELOG_AUTO_ANNOUNCE',
        'false',
        {
          rules: 'required|string|in:true,false',
        },
      ),
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
